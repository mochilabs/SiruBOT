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
	const picked = pickCaptionTracks(tracks);
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
