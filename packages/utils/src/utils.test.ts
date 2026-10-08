import { describe, expect, it, vi } from 'vitest';
import { formatTime, formatTimeToKorean } from './time.ts';
import { chunkArray } from './array.ts';
import { MemoryCache } from './memoryCache.ts';

describe('formatTime', () => {
	it('formats seconds as mm:ss', () => {
		expect(formatTime(0)).toBe('00:00');
		expect(formatTime(65)).toBe('01:05');
		expect(formatTime(3599)).toBe('59:59');
	});

	it('formats hours as hh:mm:ss', () => {
		expect(formatTime(3600)).toBe('01:00:00');
		expect(formatTime(3723)).toBe('01:02:03');
	});

	it('returns 00:00 for invalid input', () => {
		expect(formatTime(NaN)).toBe('00:00');
		expect(formatTime(-5)).toBe('00:00');
	});
});

describe('formatTimeToKorean', () => {
	it('formats Korean durations', () => {
		expect(formatTimeToKorean(0)).toBe('0초');
		expect(formatTimeToKorean(65)).toBe('1분 5초');
		expect(formatTimeToKorean(3600)).toBe('1시간 0분');
		expect(formatTimeToKorean(3723)).toBe('1시간 2분 3초');
	});
});

describe('chunkArray', () => {
	it('divides arrays into chunks', () => {
		expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
		expect(chunkArray([1, 2], 5)).toEqual([[1, 2]]);
		expect(chunkArray([], 3)).toEqual([]);
	});

	it('throws on non-positive chunk size', () => {
		expect(() => chunkArray([1], 0)).toThrow();
		expect(() => chunkArray([1], -1)).toThrow();
	});
});

describe('MemoryCache', () => {
	it('stores and retrieves values', () => {
		const cache = new MemoryCache<string, number>({ ttl: 60_000, maxSize: 10 });
		cache.set('a', 1);
		expect(cache.get('a')).toBe(1);
		expect(cache.has('a')).toBe(true);
		expect(cache.size()).toBe(1);
	});

	it('returns undefined for missing keys', () => {
		const cache = new MemoryCache<string, number>({ ttl: 60_000, maxSize: 10 });
		expect(cache.get('missing')).toBeUndefined();
		expect(cache.has('missing')).toBe(false);
	});

	it('deletes values', () => {
		const cache = new MemoryCache<string, number>({ ttl: 60_000, maxSize: 10 });
		cache.set('a', 1);
		cache.delete('a');
		expect(cache.get('a')).toBeUndefined();
		expect(cache.size()).toBe(0);
	});

	it('expires entries after ttl', () => {
		vi.useFakeTimers();
		try {
			const cache = new MemoryCache<string, number>({ ttl: 1000, maxSize: 10 });
			cache.set('a', 1);
			expect(cache.get('a')).toBe(1);
			vi.setSystemTime(Date.now() + 1001);
			expect(cache.get('a')).toBeUndefined();
			expect(cache.has('a')).toBe(false);
		} finally {
			vi.useRealTimers();
		}
	});

	it('evicts the least recently used entry when over maxSize', () => {
		vi.useFakeTimers();
		try {
			const cache = new MemoryCache<string, number>({ ttl: 60_000, maxSize: 2 });
			cache.set('a', 1);
			vi.setSystemTime(Date.now() + 10);
			cache.set('b', 2);
			vi.setSystemTime(Date.now() + 10);
			cache.set('c', 3);
			expect(cache.size()).toBe(2);
			expect(cache.get('a')).toBeUndefined();
			expect(cache.get('b')).toBe(2);
			expect(cache.get('c')).toBe(3);
		} finally {
			vi.useRealTimers();
		}
	});

	it('retains other cached values when updating an entry at capacity', () => {
		vi.useFakeTimers();
		try {
			const cache = new MemoryCache<string, number>({ ttl: 1000, maxSize: 2 });
			cache.set('a', 1);
			vi.setSystemTime(Date.now() + 10);
			cache.set('b', 2);
			vi.setSystemTime(Date.now() + 10);
			cache.get('a');
			cache.set('a', 3);
			expect(cache.size()).toBe(2);
			expect(cache.get('b')).toBe(2);
			expect(cache.get('a')).toBe(3);
		} finally {
			vi.useRealTimers();
		}
	});

	it('enforces capacity even when all writes have the same timestamp', () => {
		vi.useFakeTimers();
		try {
			const cache = new MemoryCache<string, number>({ ttl: 1000, maxSize: 2 });
			cache.set('a', 1);
			cache.set('b', 2);
			cache.set('c', 3);
			expect(cache.size()).toBe(2);
			expect(cache.get('a')).toBeUndefined();
			expect(cache.get('b')).toBe(2);
			expect(cache.get('c')).toBe(3);
		} finally {
			vi.useRealTimers();
		}
	});
});
