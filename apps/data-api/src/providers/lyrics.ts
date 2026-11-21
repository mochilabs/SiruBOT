import { load as loadYaml } from 'js-yaml';
import type { LyricLine, LyricWord } from '@sirubot/utils/lrc';
import { displayMetadata, durationMatches, normalizeArtist, normalizeTitle } from '@sirubot/utils/trackIdentity';
import type { LyricsResult } from './types.ts';

const LRCLIB_API = 'https://lrclib.net/api';
const TIMEOUT_MS = 10_000;
const HEADERS = { 'User-Agent': 'SiruBOT/1.0' };
/** 단어 싱크 YAML 상한 — 비정상적으로 큰 응답은 파싱하지 않아요. */
const MAX_LYRICSFILE_CHARS = 400_000;

/** 괄호·대괄호로 묶인 보컬/버전 표기 제거: normalizeQuery와 q 검색이 같은 규칙을 써요. 캐시 키만 소문자로 정규화해요(검색 쿼리는 원문 유지). */
const STRIP_PARENS = /\(.*?\)|\[.*?\]/g;

function normalizeQuery(query: string): string {
	return query.replace(STRIP_PARENS, '').trim().toLowerCase();
}

/** 재생 중인 곡 정보 — 대시보드가 보내요. */
export interface LyricsTrackQuery {
	title: string;
	artist: string;
	/** 곡 길이(ms). 모르면 0 */
	durationMs: number;
	sourceName?: string | null;
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

// 제목 속 괄호에 이런 단어가 있으면 업로드 표기예요. 그 밖의 괄호((아이브), (feat. X), (Inst.))는 건드리지 않아요.
const NOISE_WORDS = String.raw`official|mv|m\/v|music\s+video|video|audio|lyrics?|visualizer|performance|live\s+clip|teaser|가사|뮤직\s*비디오|공식|해석|hd|4k|1080p`;
const NOISE_BRACKET = new RegExp(String.raw`\s*[\[(【][^\])】]*\b(?:${NOISE_WORDS})\b[^\])】]*[\])】]`, 'giu');
// 괄호 없이 제목 끝에 붙는 업로드 표기: `… MV`, `… Official Video`, `… M/V`, `… Lyric Video`
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

/**
 * YouTube 제목에서 LRCLIB 검색어를 보수적으로 정리해요.
 * 업로드 표기(MV·Official·가사 등)와 아티스트 접두사, 따옴표만 지우고, `(Inst.)`·`(Remix)` 같은 버전 표기는 남겨요.
 * 예) `IVE (아이브) 'LOVE DIVE' MV` + 아티스트 `IVE` → 제목 `LOVE DIVE`, 아티스트 `IVE`.
 */
export function cleanLyricsTerms(input: { title: string; artist: string; sourceName?: string | null }): { track: string; artist: string } {
	const meta = displayMetadata({ title: input.title, author: input.artist, sourceName: input.sourceName });
	const artist = meta.artist.replace(/\s+/g, ' ').trim();
	let title = meta.title.replace(NOISE_BRACKET, ' ').replace(/\s+/g, ' ').trim();
	title = title.replace(NOISE_TAIL, '').trim();

	// `아티스트 (표기) 제목` 형태면 접두사를 지워요 — 지운 뒤 남는 제목이 있을 때만이에요.
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

/** `lyricsfile`(YAML)에서 단어 싱크 줄을 뽑아요. 단어가 하나도 없거나 형식이 다르면 null. */
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

/** 같은 곡 규칙(D-9)에 맞는 후보인지 — 연주곡 제외, 제목·아티스트 일치, 길이 ±3초(모르면 길이는 보지 않아요). */
function isSameTrack(candidate: LrclibTrack, query: LyricsTrackQuery, cleaned: { track: string; artist: string }): boolean {
	if (candidate.instrumental) return false;
	if (!candidate.trackName || !titleMatches(candidate.trackName, cleaned.track)) return false;
	if (cleaned.artist && !(candidate.artistName && artistMatches(candidate.artistName, cleaned.artist))) return false;
	if (query.durationMs > 0 && !durationMatches(query.durationMs, (candidate.duration ?? 0) * 1000)) return false;
	return true;
}

/** 같은 곡 후보 중 최선 — 단어 싱크 > 싱크 가사 > 일반 가사, 같으면 길이가 가까운 것, 같으면 검색 순서. */
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

/** 자유 검색(`q`) 첫 결과 — 봇 `/음악 가사`와 마지막 폴백이 써요. */
async function searchByQuery(query: string, matchKind: 'query'): Promise<LyricsResult | null> {
	const q = query.replace(STRIP_PARENS, '').trim();
	if (!q) return null;
	const { body } = await lrclibJson<LrclibTrack[]>(`/search?q=${encodeURIComponent(q)}`);
	const first = body?.[0];
	if (!first || (!first.plainLyrics && !first.syncedLyrics)) return null;
	return toResult(first, matchKind);
}

/** 가사 검색 — 결과 불변이라 장기 캐시해요. */
export async function fetchLyrics(query: string): Promise<LyricsResult> {
	const found = await searchByQuery(query, 'query');
	if (!found) throw new Error('lyrics not found');
	return found;
}

/**
 * 재생 중인 곡의 가사 — 제목·아티스트·길이로 정확히 찾아요.
 * 1) `/api/get` 2) `/api/search` 필드 검색 + 같은 곡 규칙 3) `q` 검색 첫 결과.
 */
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
		} catch {
			// get 실패는 검색으로 이어가요
		}
	}

	if (cleaned.track) {
		const params = new URLSearchParams({ track_name: cleaned.track });
		if (cleaned.artist) params.set('artist_name', cleaned.artist);
		const { body } = await lrclibJson<LrclibTrack[]>(`/search?${params}`);
		const best = pickBestCandidate(body ?? [], query, cleaned);
		if (best?.syncedLyrics) return toResult(best, 'search');
		if (best && !plainOnly) plainOnly = { track: best, kind: 'search' };
	}
	// 같은 곡의 일반 가사가 있으면 그걸 쓰고, 없을 때만 자유 검색 첫 결과로 폴백해요.
	if (plainOnly) return toResult(plainOnly.track, plainOnly.kind);

	const fallback = await searchByQuery(`${cleaned.artist} ${cleaned.track}`, 'query');
	if (!fallback) throw new Error('lyrics not found');
	return fallback;
}

export function lyricsCacheKey(query: string): string {
	return `dataapi:v1:lyrics:${normalizeQuery(query)}`;
}

export function lyricsTrackCacheKey(query: LyricsTrackQuery): string {
	const cleaned = cleanLyricsTerms({ title: query.title, artist: query.artist, sourceName: query.sourceName });
	// 길이는 5초 단위로 묶어 같은 곡의 사소한 길이 차이가 캐시를 쪼개지 않게 해요
	const bucket = Math.round(query.durationMs / 5000);
	return `dataapi:v2:lyrics-track:${normalizeQuery(cleaned.artist)}|${normalizeQuery(cleaned.track)}|${bucket}`;
}
