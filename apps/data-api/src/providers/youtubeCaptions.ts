import type { LyricLine } from '@sirubot/utils/lrc';
import { sharedCache } from '../utils/cache.ts';
import { getLogger } from '../utils/logger.ts';
import { outboundPool, ProxyUnavailableError, type OutboundRoute } from '../utils/proxyPool.ts';
import { assertNotBotChecked, youtubeClientFor } from './youtubeClient.ts';

const logger = getLogger('youtube-captions');

const CAPTION_FAIL_TTL_SECONDS = 6 * 3600;
const MAX_CAPTION_CHARS = 400_000;
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

export type CaptionOutcome = { status: 'ok'; captions: CaptionLyrics } | { status: 'none' } | { status: 'error' };

export interface CaptionLyrics {
	lines: LyricLine[];
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

// 한자만 있는 제목은 중국어인지 일본어인지 몰라서 짐작하지 않아요.
export function guessSpokenLanguage(title: string | undefined): string | null {
	if (!title) return null;
	if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(title)) return 'ja';
	if (/\p{Script=Hangul}/u.test(title)) return 'ko';
	if (/\p{L}/u.test(title) && !/[^\p{Script=Latin}\P{L}]/u.test(title)) return 'en';
	return null;
}

const FALLBACK_SOURCE_LANGS = ['ko', 'en'];

// 음성 언어 트랙이 없고 한국어·영어도 없으면 가사로 쓰지 않아요. 일본어 노래에 중국어·아랍어 번역 자막이 원문으로 붙던 문제예요.
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

async function lookupOnRoute(route: OutboundRoute, videoId: string): Promise<CaptionLyrics | null> {
	const youtube = await youtubeClientFor(route);
	// Web client caption URLs often return empty; use iOS client.
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
