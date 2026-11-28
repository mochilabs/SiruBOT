import { describe, expect, it, vi } from 'vitest';
import { mixSuggestions, TrackSuggestionService, type SuggestionHistoryRow } from './trackSuggestions.ts';

function row(trackId: string): SuggestionHistoryRow {
	return { trackId, track: { title: `title-${trackId}`, artist: `artist-${trackId}`, url: `https://youtu.be/${trackId}` } };
}

const noShuffle = () => 0.999_999;

describe('mixSuggestions', () => {
	it('puts most-played tracks first, then other recent tracks without duplicates', () => {
		const rows = ['a', 'b', 'a', 'c', 'b', 'a', 'd'].map(row);
		const result = mixSuggestions(rows, noShuffle).map((track) => track.title);
		expect(result).toEqual(['title-a', 'title-b', 'title-c', 'title-d']);
	});

	it('only counts a track as most-played when it was played at least twice', () => {
		const rows = ['x', 'y', 'z'].map(row);
		expect(mixSuggestions(rows, noShuffle).map((track) => track.title)).toEqual(['title-x', 'title-y', 'title-z']);
	});

	it('caps the mix at 10 most-played plus 15 recent tracks', () => {
		const repeated = Array.from({ length: 12 }, (_, i) => `top${i}`).flatMap((id) => [row(id), row(id)]);
		const singles = Array.from({ length: 20 }, (_, i) => row(`one${i}`));
		const result = mixSuggestions([...repeated, ...singles], noShuffle);
		expect(result).toHaveLength(25);
		expect(new Set(result.map((track) => track.url)).size).toBe(25);
	});

	it('returns an empty list for a user with no history', () => {
		expect(mixSuggestions([], noShuffle)).toEqual([]);
	});

	it('shuffles with the given random source', () => {
		const rows = ['a', 'b', 'c'].map(row);
		expect(mixSuggestions(rows, () => 0).map((track) => track.title)).toEqual(['title-b', 'title-c', 'title-a']);
	});
});

describe('TrackSuggestionService', () => {
	function setup() {
		let now = 0;
		const findMany = vi.fn(async () => ['a', 'b'].map(row));
		const service = new TrackSuggestionService({
			db: { guildTrackHistory: { findMany } } as never,
			now: () => now,
			random: noShuffle
		});
		return { service, findMany, advance: (ms: number) => (now += ms) };
	}

	it('reads the user history by userId newest first', async () => {
		const { service, findMany } = setup();
		await service.getForUser('u1');
		expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u1' }, orderBy: { createdAt: 'desc' } }));
	});

	it('keeps the same mix for a minute so the order stays put while typing', async () => {
		const { service, findMany, advance } = setup();
		const first = await service.getForUser('u1');
		advance(59_000);
		expect(await service.getForUser('u1')).toBe(first);
		expect(findMany).toHaveBeenCalledTimes(1);

		advance(2_000);
		await service.getForUser('u1');
		expect(findMany).toHaveBeenCalledTimes(2);
	});

	it('shares one query between overlapping calls for the same user', async () => {
		const { service, findMany } = setup();
		const [first, second] = await Promise.all([service.getForUser('u1'), service.getForUser('u1')]);
		expect(first).toBe(second);
		expect(findMany).toHaveBeenCalledTimes(1);
	});
});
