import { describe, expect, it } from 'vitest';
import type { WrappedStats } from '../../services/wrapped.ts';
import { stripEmoji } from './satoriKit.ts';
import { formatHour, formatMinutes, renderWrappedCard, WRAPPED_CARD_SIZE } from './wrappedCard.ts';

const base = { displayName: '당면', avatarUrl: null, periodLabel: '최근 30일', scopeLabel: '모든 서버' };

const filled: WrappedStats = {
	totalPlays: 120,
	totalMinutes: 400,
	uniqueTracks: 30,
	activeDays: 10,
	longestStreak: 4,
	peakHour: 22,
	hourCounts: Array.from({ length: 24 }, (_, i) => (i === 22 ? 9 : i % 3)),
	topTracks: [
		{ title: '밤편지 😀', artist: '아이유', thumbnail: null, plays: 12 },
		{ title: 'Super Shy', artist: 'NewJeans', thumbnail: null, plays: 9 }
	],
	topArtists: [{ artist: '아이유', plays: 40 }],
	ranking: { pool: 340, rank: 12, topPercent: 4 },
	topArtistRanking: { artist: '아이유', pool: 80, rank: 2, topPercent: 3 }
};
const empty: WrappedStats = {
	...filled,
	totalPlays: 0,
	topTracks: [],
	topArtists: [],
	ranking: null,
	topArtistRanking: null,
	peakHour: null,
	hourCounts: new Array<number>(24).fill(0)
};

/** PNG IHDR에서 가로·세로를 읽어요. */
function pngSize(png: Buffer): { width: number; height: number } {
	return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

describe('renderWrappedCard', () => {
	it('renders a PNG at the card size, emoji and Korean included', async () => {
		const png = await renderWrappedCard({ ...base, stats: filled });
		expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
		expect(pngSize(png)).toEqual(WRAPPED_CARD_SIZE);
	}, 30_000);

	it('renders a shorter card when there is no history', async () => {
		const png = await renderWrappedCard({ ...base, stats: empty });
		const size = pngSize(png);
		expect(size.width).toBe(WRAPPED_CARD_SIZE.width);
		expect(size.height).toBeLessThan(WRAPPED_CARD_SIZE.height);
	}, 30_000);
});

describe('format helpers', () => {
	it('formatMinutes', () => {
		expect(formatMinutes(45)).toBe('45분');
		expect(formatMinutes(120)).toBe('2시간');
		expect(formatMinutes(135)).toBe('2시간 15분');
	});
	it('formatHour', () => {
		expect(formatHour(0)).toBe('오전 12시');
		expect(formatHour(13)).toBe('오후 1시');
		expect(formatHour(22)).toBe('오후 10시');
	});
});

describe('stripEmoji', () => {
	it('removes emoji and collapses the gap, keeping digits and text', () => {
		expect(stripEmoji('Despacito 😀 (2017) 🇰🇷')).toBe('Despacito (2017)');
		expect(stripEmoji('👍🏽 좋아요 1번')).toBe('좋아요 1번');
		expect(stripEmoji('plain')).toBe('plain');
	});
});
