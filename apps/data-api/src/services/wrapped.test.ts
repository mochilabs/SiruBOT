import { describe, expect, it } from 'vitest';
import { MIN_RANKING_POOL, rankingOf, resolveWrappedRange, summarizeWrapped, type WrappedTrackInfo } from './wrapped.ts';

const track = (id: string, patch: Partial<WrappedTrackInfo> = {}): WrappedTrackInfo => ({
	id,
	title: `title-${id}`,
	artist: 'artist',
	duration: 180_000,
	thumbnail: null,
	recordingId: null,
	...patch
});

const kst = (day: number, hour: number) => new Date(Date.UTC(2026, 2, day, hour - 9));

describe('summarizeWrapped', () => {
	it('empty history yields zeros and no peak hour', () => {
		const stats = summarizeWrapped([], new Map());
		expect(stats).toMatchObject({ totalPlays: 0, totalMinutes: 0, uniqueTracks: 0, activeDays: 0, longestStreak: 0, peakHour: null });
		expect(stats.topTracks).toEqual([]);
		expect(stats.hourCounts).toHaveLength(24);
	});

	it('merges uploads of the same recording into one track and sums minutes', () => {
		const tracks = new Map([
			['a', track('a', { recordingId: 'rec1', thumbnail: null })],
			['b', track('b', { recordingId: 'rec1', thumbnail: 'https://i.ytimg.com/x.jpg' })],
			['c', track('c', { title: 'other', artist: 'solo' })]
		]);
		const stats = summarizeWrapped(
			[
				{ trackId: 'a', createdAt: kst(1, 20) },
				{ trackId: 'b', createdAt: kst(1, 21) },
				{ trackId: 'b', createdAt: kst(2, 21) },
				{ trackId: 'c', createdAt: kst(2, 22) }
			],
			tracks
		);
		expect(stats.uniqueTracks).toBe(2);
		expect(stats.topTracks[0]).toMatchObject({ plays: 3, thumbnail: 'https://i.ytimg.com/x.jpg' });
		expect(stats.totalMinutes).toBe(12);
		expect(stats.topArtists[0]).toEqual({ artist: 'artist', plays: 3 });
	});

	it('buckets hours and days in KST and finds the longest streak', () => {
		const tracks = new Map([['a', track('a')]]);
		const events = [kst(1, 23), kst(2, 23), kst(3, 23), kst(10, 5), kst(11, 23)].map((createdAt) => ({ trackId: 'a', createdAt }));
		const stats = summarizeWrapped(events, tracks);
		expect(stats.peakHour).toBe(23);
		expect(stats.hourCounts[23]).toBe(4);
		expect(stats.activeDays).toBe(5);
		expect(stats.longestStreak).toBe(3);
	});

	it('skips plays whose track row is missing but still counts them as plays', () => {
		const stats = summarizeWrapped([{ trackId: 'gone', createdAt: kst(1, 12) }], new Map());
		expect(stats.totalPlays).toBe(1);
		expect(stats.uniqueTracks).toBe(0);
	});
});

describe('resolveWrappedRange', () => {
	const now = new Date('2026-11-19T03:00:00Z');
	it('month is the trailing 30 days', () => {
		const range = resolveWrappedRange('month', now);
		expect(now.getTime() - range.from.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
	});
	it('year starts at KST new year', () => {
		const range = resolveWrappedRange('year', now);
		expect(range.from.toISOString()).toBe('2025-12-31T15:00:00.000Z');
		expect(range.label).toBe('2026년');
	});
	it('all starts at epoch', () => {
		expect(resolveWrappedRange('all', now).from.getTime()).toBe(0);
	});
});

describe('rankingOf', () => {
	it('hides the ranking when the pool is too small to mean anything', () => {
		expect(rankingOf(MIN_RANKING_POOL - 1, 0)).toBeNull();
	});
	it('rounds the top percent up and never reports 0%', () => {
		expect(rankingOf(1000, 0)).toEqual({ pool: 1000, rank: 1, topPercent: 1 });
		expect(rankingOf(340, 11)).toEqual({ pool: 340, rank: 12, topPercent: 4 });
	});
	it('last place is 100% and ties share the same rank via the higher count', () => {
		expect(rankingOf(10, 9)).toEqual({ pool: 10, rank: 10, topPercent: 100 });
		expect(rankingOf(10, 0)?.rank).toBe(1);
	});
});
