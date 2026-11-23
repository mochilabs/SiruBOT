import type { LyricLine } from '@sirubot/utils/lrc';
import { getLogger } from '../utils/logger.ts';
import { youtubeClient } from './youtubeClient.ts';

const logger = getLogger('youtube-captions');

const FETCH_TIMEOUT_MS = 10_000;
const MAX_CAPTION_CHARS = 400_000;
/** 번역 줄을 원문 줄에 붙일 때 허용하는 시작 시각 차이 */
const PAIR_TOLERANCE_MS = 1_500;
const MIN_LINES = 4;
const CAPTION_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

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

/** 업로더 자막(json3)을 줄 목록으로 바꿔요 — 잡음 줄은 버리고 줄바꿈은 공백으로 합쳐요. */
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
			.replace(/^[♪♫♬\s]+|[♪♫♬\s]+$/gu, '')
			.trim();
		if (!text || isNoiseLine(text)) continue;
		lines.push({ startMs: event.tStartMs, text, endMs: typeof event.dDurationMs === 'number' ? event.tStartMs + event.dDurationMs : null });
	}
	return lines.sort((a, b) => a.startMs - b.startMs);
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
 * 사람이 올린 자막 트랙 고르기 — 자동 생성(asr)은 쓰지 않아요.
 * 원문은 영상 음성 언어(자동 생성 트랙의 언어)와 같은 트랙, 그 정보가 없으면 한국어가 아닌 첫 트랙이에요.
 */
export function pickCaptionTracks(tracks: CaptionTrack[]): { original: CaptionTrack; korean: CaptionTrack | null } | null {
	const manual = tracks.filter((t) => t.kind !== 'asr');
	if (manual.length === 0) return null;
	const spoken = tracks.find((t) => t.kind === 'asr')?.language_code;
	const original =
		(spoken && manual.find((t) => baseLang(t.language_code) === baseLang(spoken))) ||
		manual.find((t) => baseLang(t.language_code) !== 'ko') ||
		manual[0]!;
	const korean = baseLang(original.language_code) === 'ko' ? null : (manual.find((t) => baseLang(t.language_code) === 'ko') ?? null);
	return { original, korean };
}

async function fetchTrackLines(track: CaptionTrack): Promise<LyricLine[]> {
	const url = new URL(track.base_url);
	url.searchParams.set('fmt', 'json3');
	const res = await fetch(url, { headers: { 'user-agent': CAPTION_USER_AGENT }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
	if (!res.ok) throw new Error(`caption fetch failed: ${res.status}`);
	return parseJson3Captions(await res.text());
}

/**
 * 영상의 업로더 자막을 가사로 가져와요. 없거나 너무 짧으면 null.
 * 웹 클라이언트의 자막 주소는 빈 응답을 주는 일이 있어 iOS 클라이언트로 조회해요.
 */
export async function fetchCaptionLyrics(videoId: string): Promise<CaptionLyrics | null> {
	if (!/^[\w-]{11}$/.test(videoId)) return null;
	try {
		const youtube = await youtubeClient();
		const info = await youtube.getInfo(videoId, { client: 'IOS' });
		const tracks = (info.captions?.caption_tracks ?? []) as CaptionTrack[];
		const picked = pickCaptionTracks(tracks);
		if (!picked) return null;
		const lines = await fetchTrackLines(picked.original);
		if (lines.length < MIN_LINES) return null;
		let koreanByLine: Record<string, string> | null = null;
		if (picked.korean) {
			try {
				koreanByLine = pairKoreanLines(lines, await fetchTrackLines(picked.korean));
			} catch (error) {
				logger.debug(`korean caption fetch failed for ${videoId}: ${String(error)}`);
			}
		}
		return { lines, koreanByLine };
	} catch (error) {
		logger.debug(`caption lookup failed for ${videoId}: ${String(error)}`);
		return null;
	}
}
