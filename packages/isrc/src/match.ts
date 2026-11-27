import { durationMatches, normalizeArtist, normalizeIsrc, normalizeTitle } from '@sirubot/utils/trackIdentity';
import type { IsrcCandidate, IsrcMatch, IsrcSearchTerms } from './types.js';

const EXACT_TOLERANCE_MS = 3_000;
const STRONG_TOLERANCE_MS = 2_000;

function artistContains(a: string, b: string): boolean {
	if (a.length < 2 || b.length < 2) return false;
	return a.includes(b) || b.includes(a);
}

/** Do not loosen: a wrong ISRC merges distinct tracks in the chart. `terms` must already be normalized. */
export function pickMatch(terms: IsrcSearchTerms, candidates: IsrcCandidate[]): IsrcMatch | null {
	if (!terms.title || !terms.artist || terms.durationMs <= 0) return null;

	const scored = candidates.flatMap((candidate) => {
		const isrc = normalizeIsrc(candidate.isrc);
		if (!isrc || normalizeTitle(candidate.title) !== terms.title) return [];
		const artists = [candidate.artist, ...(candidate.contributors ?? [])].map(normalizeArtist).filter(Boolean);
		const diff = Math.abs(candidate.durationMs - terms.durationMs);
		return [{ candidate: { ...candidate, isrc }, isrc, artists, diff }];
	});

	const exact = scored
		.filter((s) => s.artists.includes(terms.artist) && durationMatches(s.candidate.durationMs, terms.durationMs, EXACT_TOLERANCE_MS))
		.sort((a, b) => a.diff - b.diff)[0];
	if (exact) return { isrc: exact.isrc, provider: exact.candidate.provider, confidence: 'exact', candidate: exact.candidate };

	const strong = scored.filter(
		(s) =>
			durationMatches(s.candidate.durationMs, terms.durationMs, STRONG_TOLERANCE_MS) &&
			(s.candidate.artistFieldMatched || s.artists.some((artist) => artistContains(artist, terms.artist)))
	);
	if (strong.length === 0 || new Set(strong.map((s) => s.isrc)).size !== 1) return null;
	const best = strong.sort((a, b) => a.diff - b.diff)[0]!;
	return { isrc: best.isrc, provider: best.candidate.provider, confidence: 'strong', candidate: best.candidate };
}
