import type { LyricLine } from '@sirubot/utils/lrc';
import { sharedCache } from '../utils/cache.ts';
import { getLogger } from '../utils/logger.ts';
import { outboundPool, ProxyUnavailableError, type OutboundRoute } from '../utils/proxyPool.ts';
import { assertNotBotChecked, youtubeClientFor } from './youtubeClient.ts';

const logger = getLogger('youtube-captions');

/** 모든 경로가 막혀 자막을 못 받은 영상은 이만큼 다시 시도하지 않아요 */
const CAPTION_FAIL_TTL_SECONDS = 6 * 3600;
const MAX_CAPTION_CHARS = 400_000;
/** 번역 줄을 원문 줄에 붙일 때 허용하는 시작 시각 차이 */
const PAIR_TOLERANCE_MS = 1_500;
const MIN_LINES = 4;
/** 같은 줄이 이 시간 안에 다시 시작하면 한 줄을 쪼개 올린 것으로 보고 합쳐요. 그보다 늦으면 다시 부른 것이라 따로 둬요 */
const REPEAT_MERGE_WINDOW_MS = 1_500;
/** 앞 조각이 끝나고 이만큼 넘게 비면 이어진 조각이 아니에요 */
const REPEAT_MERGE_MAX_GAP_MS = 100;
const SPAM_MIN_TOKENS = 8;
const SPAM_MAX_DISTINCT_RATIO = 4;
const SPAM_MIN_UNIT_REPEATS = 6;
const SPAM_MAX_UNIT_LENGTH = 12;
const CAPTION_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

/** 자막 조회 결과 — `error`는 막혀서 못 받은 것이라 가사 캐시를 짧게 잡아요. */
export type CaptionOutcome = { status: 'ok'; captions: CaptionLyrics } | { status: 'none' } | { status: 'error' };

export interface CaptionLyrics {
	/** 원문 자막 줄 (시작 시각 순) */
	lines: LyricLine[];
	/** 원문 줄 → 업로더가 올린 한국어 자막. 한국어 트랙이 따로 없으면 null */
	koreanByLine: Record<string, string> | null;
}

interface CaptionTrack {
	base_url: string;
	language_code: string;
	kind?: string;
}

interface Json3Event {
	tStartMs?: number;
	dDurationMs?: number;
	segs?: Array<{ utf8?: string }>;
}

const baseLang = (code: string) => code.toLowerCase().split('-')[0] ?? '';

/** `[Music]`, `(박수)`, `♪`처럼 가사가 아닌 줄 */
function isNoiseLine(text: string): boolean {
	const stripped = text.replace(/[♪♫♬🎵🎶\s]/gu, '');
	if (!stripped) return true;
	return /^[[(（【].*[\])）】]$/u.test(stripped);
}

const EDGE_SYMBOLS = /^[\s\p{S}\p{Pd}~〜…·*_#]+|[\s\p{S}\p{Pd}~〜…·*_#]+$/gu;
const REPEATED_UNIT = new RegExp(`^(.{1,${SPAM_MAX_UNIT_LENGTH}}?)\\1{${SPAM_MIN_UNIT_REPEATS - 1},}$`, 'u');

/** 같은 말을 도배한 줄 — 단어가 거의 다 같거나(`yeah yeah yeah …`), 짧은 조각이 붙어서 반복돼요(`아아아아아아`). */
function isRepeatSpam(text: string): boolean {
	const tokens = text.split(/\s+/);
	if (tokens.length >= SPAM_MIN_TOKENS && new Set(tokens).size * SPAM_MAX_DISTINCT_RATIO <= tokens.length) return true;
	return REPEATED_UNIT.test(text.replace(/\s+/g, ''));
}

/**
 * 같은 줄을 짧게 쪼개 연달아 올린 조각은 한 줄로 합치고, 그 줄이 마지막 조각이 끝날 때까지 이어지게 해요.
 * 앞 조각보다 `REPEAT_MERGE_WINDOW_MS` 넘게 늦게 시작하거나 사이가 비면 다시 부른 것이라 따로 둬요 — 다 합치면 싱크가 어긋나요.
 */
function collapseRepeatedLines(lines: LyricLine[]): LyricLine[] {
	const collapsed: LyricLine[] = [];
	let lastPiece: LyricLine | null = null;
	for (const line of lines) {
		const previous = collapsed.at(-1);
		const isSplitPiece =
			previous?.text === line.text &&
			lastPiece != null &&
			line.startMs - lastPiece.startMs <= REPEAT_MERGE_WINDOW_MS &&
			(lastPiece.endMs == null || line.startMs - lastPiece.endMs <= REPEAT_MERGE_MAX_GAP_MS);
		lastPiece = line;
		if (!isSplitPiece) {
			collapsed.push({ ...line });
			continue;
		}
		if (previous.endMs != null && line.endMs != null) previous.endMs = Math.max(previous.endMs, line.endMs);
	}
	return collapsed;
}

/** 업로더 자막(json3)을 줄 목록으로 바꿔요 — 잡음·도배 줄은 버리고 줄바꿈은 공백으로 합쳐요. 앞뒤 기호는 잘라내요. */
export function parseJson3Captions(raw: string): LyricLine[] {
	if (raw.length > MAX_CAPTION_CHARS) return [];
	let doc: { events?: Json3Event[] };
	try {
		doc = JSON.parse(raw) as { events?: Json3Event[] };
	} catch {
		return [];
	}
	const lines: LyricLine[] = [];
	for (const event of doc.events ?? []) {
		if (!event.segs || typeof event.tStartMs !== 'number') continue;
		const text = event.segs
			.map((seg) => seg.utf8 ?? '')
			.join('')
			.replace(/\s*\n\s*/g, ' ')
			.replace(EDGE_SYMBOLS, '');
		if (!text || isNoiseLine(text) || isRepeatSpam(text)) continue;
		lines.push({ startMs: event.tStartMs, text, endMs: typeof event.dDurationMs === 'number' ? event.tStartMs + event.dDurationMs : null });
	}
	return collapseRepeatedLines(lines.sort((a, b) => a.startMs - b.startMs));
}

/** 한국어 자막 줄을 시작 시각이 가장 가까운 원문 줄에 붙여요. */
export function pairKoreanLines(original: LyricLine[], korean: LyricLine[]): Record<string, string> | null {
	const out: Record<string, string> = {};
	for (const ko of korean) {
		let best: LyricLine | null = null;
		let bestDelta = PAIR_TOLERANCE_MS + 1;
		for (const line of original) {
			const delta = Math.abs(line.startMs - ko.startMs);
			if (delta < bestDelta) {
				best = line;
				bestDelta = delta;
			}
		}
		if (best && ko.text !== best.text && !(best.text in out)) out[best.text] = ko.text;
	}
	return Object.keys(out).length > 0 ? out : null;
}

/**
 * 자동 생성 트랙이 없을 때 제목 글자로 음성 언어를 짐작해요 — 가나가 있으면 일본어, 한글이 있으면 한국어, 라틴 글자뿐이면 영어.
 * 한자만 있는 제목은 중국어인지 일본어인지 모르니 짐작하지 않아요.
 */
export function guessSpokenLanguage(title: string | undefined): string | null {
	if (!title) return null;
	if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(title)) return 'ja';
	if (/\p{Script=Hangul}/u.test(title)) return 'ko';
	if (/\p{L}/u.test(title) && !/[^\p{Script=Latin}\P{L}]/u.test(title)) return 'en';
	return null;
}

/** 음성 언어 트랙이 없을 때 원문으로 쓰는 차례 — 한국어는 그대로 읽히고, 영어는 번역해 붙여요. 다른 언어 번역 자막은 원문으로 쓰지 않아요 */
const FALLBACK_SOURCE_LANGS = ['ko', 'en'];

/**
 * 사람이 올린 자막 트랙 고르기 — 자동 생성(asr)은 쓰지 않아요.
 * 원문은 영상 음성 언어(자동 생성 트랙의 언어, 없으면 제목으로 짐작) 트랙이 먼저고, 없으면 한국어 → 영어 차례예요.
 * 그 밖의 언어만 있으면 가사로 쓰지 않아요 — 일본어 노래에 중국어·아랍어 자막이 원문으로 붙던 문제예요.
 */
export function pickCaptionTracks(tracks: CaptionTrack[], title?: string): { original: CaptionTrack; korean: CaptionTrack | null } | null {
	const manual = tracks.filter((t) => t.kind !== 'asr');
	const spoken = tracks.find((t) => t.kind === 'asr')?.language_code ?? guessSpokenLanguage(title);
	const priority = spoken ? [baseLang(spoken), ...FALLBACK_SOURCE_LANGS] : FALLBACK_SOURCE_LANGS;
	let original: CaptionTrack | undefined;
	for (const lang of priority) {
		original = manual.find((t) => baseLang(t.language_code) === lang);
		if (original) break;
	}
	if (!original) return null;
	const korean = baseLang(original.language_code) === 'ko' ? null : (manual.find((t) => baseLang(t.language_code) === 'ko') ?? null);
	return { original, korean };
}

async function fetchTrackLines(route: OutboundRoute, track: CaptionTrack): Promise<LyricLine[]> {
	const url = new URL(track.base_url);
	url.searchParams.set('fmt', 'json3');
	const res = await route.fetch(url, { headers: { 'user-agent': CAPTION_USER_AGENT } });
	if (!res.ok) throw new Error(`caption fetch failed: ${res.status}`);
	return parseJson3Captions(await res.text());
}

export function captionFailKey(videoId: string): string {
	return `dataapi:v1:caption-fail:${videoId}`;
}

/** 경로 하나로 자막 작업 전체(영상 정보 + 원문·한국어 자막)를 해요. */
async function lookupOnRoute(route: OutboundRoute, videoId: string): Promise<CaptionLyrics | null> {
	const youtube = await youtubeClientFor(route);
	// 웹 클라이언트의 자막 주소는 빈 응답을 주는 일이 있어 iOS 클라이언트로 조회해요
	const info = await youtube.getInfo(videoId, { client: 'IOS' });
	assertNotBotChecked(route, info.playability_status);
	const tracks = (info.captions?.caption_tracks ?? []) as CaptionTrack[];
	const picked = pickCaptionTracks(tracks, info.basic_info.title);
	if (!picked) return null;
	const lines = await fetchTrackLines(route, picked.original);
	if (lines.length < MIN_LINES) return null;
	let koreanByLine: Record<string, string> | null = null;
	if (picked.korean) {
		try {
			koreanByLine = pairKoreanLines(lines, await fetchTrackLines(route, picked.korean));
		} catch (error) {
			logger.debug(`korean caption fetch failed for ${videoId}: ${String(error)}`);
		}
	}
	return { lines, koreanByLine };
}

/**
 * 영상의 업로더 자막을 가사로 가져와요. 나가는 경로는 `outboundPool()`이 골라요(direct 우선, 막히면 프록시).
 * 모든 경로가 막히면 그 영상은 6시간 동안 다시 시도하지 않아요.
 */
export async function fetchCaptionLyrics(videoId: string): Promise<CaptionOutcome> {
	if (!/^[\w-]{11}$/.test(videoId)) return { status: 'none' };
	const failKey = captionFailKey(videoId);
	if (await sharedCache.get(failKey)) return { status: 'error' };
	try {
		const captions = await outboundPool().run('captions', (route) => lookupOnRoute(route, videoId));
		return captions ? { status: 'ok', captions } : { status: 'none' };
	} catch (error) {
		if (error instanceof ProxyUnavailableError) {
			logger.debug(`caption lookup blocked for ${videoId}: ${error.message}`);
			await sharedCache.set(failKey, '1', CAPTION_FAIL_TTL_SECONDS);
		} else {
			logger.debug(`caption lookup failed for ${videoId}: ${String(error)}`);
		}
		return { status: 'error' };
	}
}
