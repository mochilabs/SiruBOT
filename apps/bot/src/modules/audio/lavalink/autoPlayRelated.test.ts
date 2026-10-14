import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from 'lavalink-client';
import { normalizeTitle, titleSimilarity, pickBySimilarity, fetchRelatedCandidate } from './autoPlayRelated.ts';

const { container } = vi.hoisted(() => ({
	container: { logger: { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }
}));

vi.mock('@sapphire/framework', () => ({ container }));

function track(title: string, identifier: string, duration = 100_000, extra: Record<string, unknown> = {}): Track {
	return {
		info: { title, identifier, duration },
		encoded: `enc-${identifier}`,
		...extra
	} as unknown as Track;
}

describe('normalizeTitle', () => {
	it('strips bracketed suffixes, separators and special characters', () => {
		expect(normalizeTitle('Song Name (Official MV)')).toBe('song name');
		expect(normalizeTitle('Song Name [Lyrics]')).toBe('song name');
		expect(normalizeTitle('Artist - Topic')).toBe('artist');
		expect(normalizeTitle('Title | Official Audio')).toBe('title');
	});

	it('collapses whitespace and keeps unicode letters', () => {
		expect(normalizeTitle('  봄    사랑   노래  ')).toBe('봄 사랑 노래');
		expect(normalizeTitle('Hello!! World...')).toBe('hello world');
	});
});

describe('titleSimilarity', () => {
	it('returns 1 for identical titles and 0 for titles that normalize to empty', () => {
		expect(titleSimilarity('Nightcore', 'NIGHTCORE')).toBe(1);
		expect(titleSimilarity('(...)!!!', '[[[]]]')).toBe(0);
	});

	it('returns 0 when either side is too short to compare', () => {
		expect(titleSimilarity('ab', 'a')).toBe(0);
		expect(titleSimilarity('abcd', 'a')).toBe(0);
	});

	it('computes the dice coefficient of normalized bigrams', () => {
		// 'abcd' vs 'abce' → 공통 bigram ab,bc (2개) / 전체 bigram 3+3 → 2*2/6
		expect(titleSimilarity('abcd', 'abce')).toBeCloseTo(2 / 3, 5);
		expect(titleSimilarity('abcd', 'wxyz')).toBe(0);
	});
});

describe('pickBySimilarity bands', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('empty candidates → null', () => {
		expect(pickBySimilarity([], track('abcd', 'ref'))).toBeNull();
	});

	it('picks the mid-band candidate and drops too-similar and too-different ones', () => {
		const reference = track('abcd', 'ref', 100_000);
		// 동일 제목+동일 길이 → 유사도 1.0 (≥ HIGH) → 상위 밴드에서 제외
		const tooSimilar = track('abcd', 'dup', 100_000);
		// titleSim 2/3, durSim 0.5 → 0.6*2/3 + 0.4*0.5 = 0.6 (중간 밴드)
		const mid = track('abce', 'mid', 200_000);
		// titleSim 0, durSim 0.1 → 0.04 (< LOW) → 하위 제외
		const tooDifferent = track('wxyz', 'diff', 1_000_000);

		const picked = pickBySimilarity([tooSimilar, mid, tooDifferent], reference);
		expect(picked).toBe(mid);
	});

	it('relaxes only the lower bound when no mid-band candidate exists', () => {
		const reference = track('abcd', 'ref', 100_000);
		const unrelated = track('wxyz', 'diff', 1_000_000); // 0.04 → 밴드1 제외, 밴드2(<HIGH)에는 포함
		expect(pickBySimilarity([unrelated], reference)).toBe(unrelated);
	});

	it('falls back to all candidates when everything is too similar', () => {
		const reference = track('abcd', 'ref', 100_000);
		const identical = track('abcd', 'dup', 100_000); // 1.0 → 밴드1·2 모두 제외 → 밴드3(전체)
		expect(pickBySimilarity([identical], reference)).toBe(identical);
	});
});

describe('fetchRelatedCandidate hard exclusions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	function makePlayer(searchResult: { loadType: string; tracks: Track[] }) {
		const search = vi.fn(async () => searchResult);
		return {
			node: { search },
			queue: {
				current: track('current song', 'current-id', 90_000),
				previous: [track('past song', 'previous-id', 80_000)],
				tracks: [track('waiting song', 'waiting-id', 70_000)]
			}
		} as unknown as Parameters<typeof fetchRelatedCandidate>[0];
	}

	it('hard-excludes current/previous/queued identifiers from the search results', async () => {
		const reference = track('abcd', 'ref', 100_000);
		const midCandidate = track('abce', 'fresh-mid', 200_000); // 유사도 0.6 → 유일한 중간 밴드
		const player = makePlayer({
			loadType: 'search',
			tracks: [
				track('current song', 'current-id', 90_000), // 큐 current → 하드 제외
				track('past song', 'previous-id', 80_000), // 재생 이력 → 하드 제외
				track('waiting song', 'waiting-id', 70_000), // 대기열 → 하드 제외
				track('abcd', 'ref', 100_000), // 마지막 재생 곡 자신 → 하드 제외
				midCandidate
			]
		});

		const selected = await fetchRelatedCandidate(player, reference);
		expect(selected).toBe(midCandidate);
	});

	it('applies extraExcludes for consecutive picks in the same request', async () => {
		const reference = track('abcd', 'ref', 100_000);
		const secondCandidate = track('abce', 'second', 200_000);
		const player = makePlayer({
			loadType: 'search',
			tracks: [
				track('abce', 'first', 200_000), // extraExcludes에 이미 있음 → 제외
				secondCandidate
			]
		});

		const selected = await fetchRelatedCandidate(player, reference, ['first']);
		expect(selected).toBe(secondCandidate);
	});

	it('returns null when every candidate is hard-excluded', async () => {
		const reference = track('abcd', 'ref', 100_000);
		const player = makePlayer({
			loadType: 'search',
			tracks: [track('current song', 'current-id', 90_000), track('past song', 'previous-id', 80_000)]
		});

		expect(await fetchRelatedCandidate(player, reference)).toBeNull();
	});

	it('returns null on error or empty search results', async () => {
		const reference = track('abcd', 'ref', 100_000);
		expect(await fetchRelatedCandidate(makePlayer({ loadType: 'empty', tracks: [] }), reference)).toBeNull();

		const errorPlayer = {
			node: {
				search: vi.fn(async () => {
					throw new Error('node down');
				})
			},
			queue: { current: null, previous: [], tracks: [] }
		} as unknown as Parameters<typeof fetchRelatedCandidate>[0];
		expect(await fetchRelatedCandidate(errorPlayer, reference)).toBeNull();
	});
});
