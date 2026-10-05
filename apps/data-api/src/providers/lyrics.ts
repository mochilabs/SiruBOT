import type { LyricsResult } from './types.ts';

const LRCLIB_BASE = 'https://lrclib.net/api/search';
const TIMEOUT_MS = 10_000;

function normalizeQuery(query: string): string {
	return query
		.replace(/\(.*?\)|\[.*?\]/g, '')
		.trim()
		.toLowerCase();
}

/** 가사 검색 — 결과 불변이라 장기 캐시해요. */
export async function fetchLyrics(query: string): Promise<LyricsResult> {
	const q = query.replace(/\(.*?\)|\[.*?\]/g, '').trim();
	const res = await fetch(`${LRCLIB_BASE}?q=${encodeURIComponent(q)}`, {
		headers: { 'User-Agent': 'SiruBOT/1.0' },
		signal: AbortSignal.timeout(TIMEOUT_MS)
	});
	if (!res.ok) throw new Error(`lrclib failed: ${res.status}`);
	const results = (await res.json()) as Array<{
		trackName: string;
		artistName: string;
		plainLyrics: string | null;
		syncedLyrics: string | null;
	}>;
	const first = results?.[0];
	if (!first || (!first.plainLyrics && !first.syncedLyrics)) throw new Error('lyrics not found');
	return {
		trackName: first.trackName,
		artistName: first.artistName,
		plainLyrics: first.plainLyrics,
		syncedLyrics: first.syncedLyrics
	};
}

export function lyricsCacheKey(query: string): string {
	return `dataapi:v1:lyrics:${normalizeQuery(query)}`;
}
