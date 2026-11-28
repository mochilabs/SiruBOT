import { load as loadYaml } from 'js-yaml';
import type { LyricLine, LyricWord } from '@sirubot/utils/lrc';
import { displayMetadata, durationMatches, normalizeArtist, normalizeTitle } from '@sirubot/utils/trackIdentity';
import type { LyricsResult } from './types.ts';
import { fetchCaptionLyrics } from './youtubeCaptions.ts';

const LRCLIB_API = 'https://lrclib.net/api';
const TIMEOUT_MS = 10_000;

export class LyricsNotFoundError extends Error {
	public constructor() {
		super('lyrics not found');
		this.name = 'LyricsNotFoundError';
	}
}
const HEADERS = { 'User-Agent': 'SiruBOT/1.0' };
const MAX_LYRICSFILE_CHARS = 400_000;

const STRIP_PARENS = /\(.*?\)|\[.*?\]/g;

function normalizeQuery(query: string): string {
	return query.replace(STRIP_PARENS, '').trim().toLowerCase();
}

export interface LyricsTrackQuery {
	title: string;
	artist: string;
	durationMs: number;
	sourceName?: string | null;
	videoId?: string | null;
}

interface LrclibTrack {
	id?: number;
	trackName?: string | null;
	artistName?: string | null;
	duration?: number | null;
	instrumental?: boolean;
	hasWordSync?: boolean;
	plainLyrics?: string | null;
	syncedLyrics?: string | null;
	lyricsfile?: string | null;
}

const NOISE_WORDS = String.raw`official|mv|m\/v|music\s+video|video|audio|lyrics?|visualizer|performance|live\s+clip|teaser|가사|뮤직\s*비디오|공식|해석|hd|4k|1080p`;
// Avoid \b since it fails next to Hangul/Kana (e.g. 【공식】).
const NOISE_BRACKET = new RegExp(String.raw`\s*[\[(【][^\])】]*(?<![\p{L}\p{N}])(?:${NOISE_WORDS})(?![\p{L}\p{N}])[^\])】]*[\])】]`, 'giu');
const NOISE_TAIL = new RegExp(
	String.raw`\s+(?:official\s+)?(?:music\s+video|mv|m\/v|lyric\s+video|lyrics?\s+video|audio|video|visualizer)\s*$`,
	'iu'
);
const QUOTE_PAIRS: Array<[string, string]> = [
	["'", "'"],
	['"', '"'],
	['‘', '’'],
	['“', '”'],
	['「', '」'],
	['『', '』']
];

function stripEnclosingQuotes(text: string): string {
	const trimmed = text.trim();
	for (const [open, close] of QUOTE_PAIRS) {
		if (trimmed.length > 2 && trimmed.startsWith(open) && trimmed.endsWith(close)) return trimmed.slice(open.length, -close.length).trim();
	}
	return trimmed;
}

export function cleanLyricsTerms(input: { title: string; artist: string; sourceName?: string | null }): { track: string; artist: string } {
	const meta = displayMetadata({ title: input.title, author: input.artist, sourceName: input.sourceName });
	const artist = meta.artist.replace(/\s+/g, ' ').trim();
	let title = meta.title.replace(NOISE_BRACKET, ' ').replace(/\s+/g, ' ').trim();
	title = title.replace(NOISE_TAIL, '').trim();

	const artistNorm = normalizeArtist(artist);
	if (artistNorm.length >= 2) {
		const prefix = new RegExp(`^${artist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(?:[(\\[][^)\\]]*[)\\]])?\\s*[-–—:]?\\s*`, 'iu');
		const stripped = title.replace(prefix, '').trim();
		if (stripped && stripped !== title) title = stripped;
	}
	title = stripEnclosingQuotes(title.replace(NOISE_TAIL, '').trim());
	return { track: title || meta.title, artist };
}

async function lrclibJson<T>(path: string): Promise<{ status: number; body: T | null }> {
	const res = await fetch(`${LRCLIB_API}${path}`, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
	if (res.status === 404) return { status: 404, body: null };
	if (!res.ok) throw new Error(`lrclib failed: ${res.status}`);
	return { status: res.status, body: (await res.json()) as T };
}

export function parseLyricsfileWords(yaml: string | null | undefined): LyricLine[] | null {
	if (!yaml || yaml.length > MAX_LYRICSFILE_CHARS) return null;
	let doc: unknown;
	try {
		doc = loadYaml(yaml);
	} catch {
		return null;
	}
	const rawLines = (doc as { lines?: unknown } | null)?.lines;
	if (!Array.isArray(rawLines)) return null;

	const lines: LyricLine[] = [];
	let hasWords = false;
	for (const raw of rawLines) {
		if (!raw || typeof raw !== 'object') continue;
		const line = raw as { text?: unknown; start_ms?: unknown; end_ms?: unknown; words?: unknown };
		if (typeof line.start_ms !== 'number' || !Number.isFinite(line.start_ms)) continue;
		const words: LyricWord[] = [];
		if (Array.isArray(line.words)) {
			for (const w of line.words) {
				const word = w as { text?: unknown; start_ms?: unknown } | null;
				if (typeof word?.text === 'string' && typeof word.start_ms === 'number' && Number.isFinite(word.start_ms)) {
					words.push({ startMs: word.start_ms, text: word.text });
				}
			}
		}
		const text = typeof line.text === 'string' ? line.text : words.map((w) => w.text).join('');
		const entry: LyricLine = { startMs: line.start_ms, text: text.trim(), endMs: typeof line.end_ms === 'number' ? line.end_ms : null };
		if (words.length > 0) {
			entry.words = words.sort((a, b) => a.startMs - b.startMs);
			hasWords = true;
		}
		lines.push(entry);
	}
	if (!hasWords) return null;
	return lines.sort((a, b) => a.startMs - b.startMs);
}

function artistMatches(candidate: string, wanted: string): boolean {
	const a = normalizeArtist(candidate);
	const b = normalizeArtist(wanted);
	if (!a || !b) return false;
	return a === b || (Math.min(a.length, b.length) >= 2 && (a.includes(b) || b.includes(a)));
}

function titleMatches(candidate: string, wanted: string): boolean {
	const a = normalizeTitle(candidate);
	const b = normalizeTitle(wanted);
	if (!a || !b) return false;
	return a === b;
}

const LYRICS_DURATION_TOLERANCE_MS = 10_000;

function isSameTrack(candidate: LrclibTrack, query: LyricsTrackQuery, cleaned: { track: string; artist: string }): boolean {
	if (candidate.instrumental) return false;
	if (!candidate.trackName || !titleMatches(candidate.trackName, cleaned.track)) return false;
	if (cleaned.artist && !(candidate.artistName && artistMatches(candidate.artistName, cleaned.artist))) return false;
	if (query.durationMs > 0 && !durationMatches(query.durationMs, (candidate.duration ?? 0) * 1000, LYRICS_DURATION_TOLERANCE_MS)) return false;
	return true;
}

function isLooseSameTrack(candidate: LrclibTrack, query: LyricsTrackQuery, cleaned: { track: string; artist: string }): boolean {
	if (candidate.instrumental || !candidate.trackName || !titleMatches(candidate.trackName, cleaned.track)) return false;
	const artistOk = Boolean(cleaned.artist && candidate.artistName && artistMatches(candidate.artistName, cleaned.artist));
	const durationOk = query.durationMs > 0 && durationMatches(query.durationMs, (candidate.duration ?? 0) * 1000, LYRICS_DURATION_TOLERANCE_MS);
	return artistOk || durationOk;
}

export function pickBestCandidate(
	candidates: LrclibTrack[],
	query: LyricsTrackQuery,
	cleaned: { track: string; artist: string }
): LrclibTrack | null {
	const rank = (t: LrclibTrack) => (t.hasWordSync && t.lyricsfile ? 2 : 0) + (t.syncedLyrics ? 2 : 0) + (t.plainLyrics ? 1 : 0);
	const matching = candidates.filter((t) => isSameTrack(t, query, cleaned) && (t.syncedLyrics || t.plainLyrics));
	let best: LrclibTrack | null = null;
	let bestRank = -1;
	let bestDelta = Infinity;
	for (const t of matching) {
		const r = rank(t);
		const delta = query.durationMs > 0 ? Math.abs(query.durationMs - (t.duration ?? 0) * 1000) : 0;
		if (r > bestRank || (r === bestRank && delta < bestDelta)) {
			best = t;
			bestRank = r;
			bestDelta = delta;
		}
	}
	return best;
}

function toResult(track: LrclibTrack, matchKind: NonNullable<LyricsResult['matchKind']>): LyricsResult {
	const wordSync = track.hasWordSync ? parseLyricsfileWords(track.lyricsfile) : null;
	return {
		trackName: track.trackName ?? '',
		artistName: track.artistName ?? '',
		plainLyrics: track.plainLyrics ?? null,
		syncedLyrics: track.syncedLyrics ?? null,
		durationSec: track.duration ?? null,
		hasWordSync: wordSync !== null,
		wordSync,
		matchKind
	};
}

function pad(n: number, width = 2): string {
	return String(n).padStart(width, '0');
}

function toLrcTimestamp(ms: number): string {
	const total = Math.max(0, Math.round(ms / 10));
	return `[${pad(Math.floor(total / 6000))}:${pad(Math.floor(total / 100) % 60)}.${pad(total % 100)}]`;
}

async function captionResult(
	query: LyricsTrackQuery,
	cleaned: { track: string; artist: string }
): Promise<{ result: LyricsResult | null; status: 'ok' | 'none' | 'error' | null }> {
	if (!query.videoId) return { result: null, status: null };
	const outcome = await fetchCaptionLyrics(query.videoId);
	if (outcome.status !== 'ok') return { result: null, status: outcome.status };
	const { captions } = outcome;
	return {
		status: 'ok',
		result: {
			trackName: cleaned.track,
			artistName: cleaned.artist,
			plainLyrics: captions.lines.map((l) => l.text).join('\n'),
			syncedLyrics: captions.lines.map((l) => `${toLrcTimestamp(l.startMs)}${l.text}`).join('\n'),
			durationSec: query.durationMs > 0 ? Math.round(query.durationMs / 1000) : null,
			hasWordSync: false,
			wordSync: null,
			matchKind: 'captions',
			captionTranslation: captions.koreanByLine,
			captionStatus: 'ok'
		}
	};
}

async function searchByQuery(query: string, matchKind: 'query', accept?: (track: LrclibTrack) => boolean): Promise<LyricsResult | null> {
	const q = query.replace(STRIP_PARENS, '').trim();
	if (!q) return null;
	const { body } = await lrclibJson<LrclibTrack[]>(`/search?q=${encodeURIComponent(q)}`);
	const found = (body ?? []).find((t) => (t.plainLyrics || t.syncedLyrics) && (!accept || accept(t)));
	return found ? toResult(found, matchKind) : null;
}

export async function fetchLyrics(query: string): Promise<LyricsResult> {
	const found = await searchByQuery(query, 'query');
	if (!found) throw new LyricsNotFoundError();
	return found;
}

export async function fetchLyricsForTrack(query: LyricsTrackQuery): Promise<LyricsResult> {
	const cleaned = cleanLyricsTerms({ title: query.title, artist: query.artist, sourceName: query.sourceName });
	let plainOnly: { track: LrclibTrack; kind: 'get' | 'search' } | null = null;

	if (cleaned.track && cleaned.artist) {
		const params = new URLSearchParams({ track_name: cleaned.track, artist_name: cleaned.artist });
		if (query.durationMs >= 1000) params.set('duration', String(Math.round(query.durationMs / 1000)));
		try {
			const { body } = await lrclibJson<LrclibTrack>(`/get?${params}`);
			if (body && !body.instrumental) {
				if (body.syncedLyrics) return toResult(body, 'get');
				if (body.plainLyrics) plainOnly = { track: body, kind: 'get' };
			}
		} catch {}
	}

	if (cleaned.track) {
		const params = new URLSearchParams({ track_name: cleaned.track });
		if (cleaned.artist) params.set('artist_name', cleaned.artist);
		const { body } = await lrclibJson<LrclibTrack[]>(`/search?${params}`);
		const best = pickBestCandidate(body ?? [], query, cleaned);
		if (best?.syncedLyrics) return toResult(best, 'search');
		if (best && !plainOnly) plainOnly = { track: best, kind: 'search' };
	}
	const captions = await captionResult(query, cleaned);
	if (captions.result) return captions.result;
	if (plainOnly) return { ...toResult(plainOnly.track, plainOnly.kind), captionStatus: captions.status };

	const fallback = await searchByQuery(`${cleaned.artist} ${cleaned.track}`, 'query', (t) => isLooseSameTrack(t, query, cleaned));
	if (!fallback) throw new LyricsNotFoundError();
	return { ...fallback, captionStatus: captions.status };
}

/** 2: 번역 자막을 원문으로 쓰던 결과와 같은 줄을 다 합치던 결과를 버려요 */
const CAPTION_RULES_VERSION = 2;

export function lyricsCacheKey(query: string): string {
	return `dataapi:v1:lyrics:${normalizeQuery(query)}`;
}

export function lyricsTrackCacheKey(query: LyricsTrackQuery): string {
	const cleaned = cleanLyricsTerms({ title: query.title, artist: query.artist, sourceName: query.sourceName });
	const bucket = Math.round(query.durationMs / 5000);
	const base = `dataapi:v2:lyrics-track:${normalizeQuery(cleaned.artist)}|${normalizeQuery(cleaned.track)}|${bucket}`;
	// 자막을 고르는 규칙이 바뀌면 CAPTION_RULES_VERSION을 올려 예전 규칙으로 고른 결과를 버려요.
	return query.videoId ? `${base}|${query.videoId}|c${CAPTION_RULES_VERSION}` : base;
}
