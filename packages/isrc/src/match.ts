import { durationMatches, normalizeArtist, normalizeIsrc, normalizeTitle } from '@sirubot/utils/trackIdentity';
import type { IsrcCandidate, IsrcMatch, IsrcSearchTerms } from './types.js';

const EXACT_TOLERANCE_MS = 3_000;
const STRONG_TOLERANCE_MS = 2_000;

function artistContains(a: string, b: string): boolean {
	if (a.length < 2 || b.length < 2) return false;
	return a.includes(b) || b.includes(a);
}

/**
 * 후보 중 같은 녹음을 골라요. 기준을 느슨하게 하지 마세요 — 잘못된 ISRC는 차트에서 다른 두 곡을 합쳐요.
 * - exact: 제목 일치 + 아티스트(또는 contributor) 일치 + 길이 ±3초
 * - strong: 제목 일치 + 길이 ±2초 + (아티스트 부분 일치 또는 프로바이더의 아티스트 필드 검색 결과), 그리고 그런 후보의 ISRC가 하나뿐일 때
 * `terms`는 이미 정규화된 값이에요 (resolveIsrc가 trackIdentity로 만들어요).
 */
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
