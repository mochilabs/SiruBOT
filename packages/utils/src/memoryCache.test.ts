import { describe, expect, it, vi } from 'vitest';
import { MemoryCache } from './memoryCache.ts';

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
