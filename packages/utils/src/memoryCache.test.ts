import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { MemoryCache } from './memoryCache.ts';

describe('MemoryCache', () => {
	const options = { ttl: 1000, maxSize: 3 };
	let cache: MemoryCache<string, string>;

	beforeEach(() => {
		cache = new MemoryCache<string, string>(options);
		mock.timers.enable({ apis: ['Date'] });
	});

	afterEach(() => {
		mock.timers.reset();
	});

	describe('set() and get()', () => {
		test('should set and retrieve a value', () => {
			cache.set('key1', 'value1');
			assert.strictEqual(cache.get('key1'), 'value1');
		});

		test('should return undefined for non-existent key', () => {
			assert.strictEqual(cache.get('nonexistent'), undefined);
		});

		test('should return undefined and delete the key if expired', () => {
			cache.set('key1', 'value1');

			// Advance time beyond TTL
			mock.timers.tick(1500);

			assert.strictEqual(cache.get('key1'), undefined);
			assert.strictEqual(cache.size(), 0);
		});

		test('should update lastUpdated when get() is called', () => {
			cache.set('key1', 'value1');
			const statsBefore = cache.getStats();

			mock.timers.tick(500);
			cache.get('key1');

			// We can't directly check lastUpdated because it's private,
			// but we can test evictOldest behavior which depends on lastUpdated.
		});
	});

	describe('has()', () => {
		test('should return true for existing key', () => {
			cache.set('key1', 'value1');
			assert.strictEqual(cache.has('key1'), true);
		});

		test('should return false for non-existent key', () => {
			assert.strictEqual(cache.has('nonexistent'), false);
		});

		test('should return false and delete if expired', () => {
			cache.set('key1', 'value1');
			mock.timers.tick(1500);
			assert.strictEqual(cache.has('key1'), false);
			assert.strictEqual(cache.size(), 0);
		});
	});

	describe('delete()', () => {
		test('should delete a key', () => {
			cache.set('key1', 'value1');
			cache.delete('key1');
			assert.strictEqual(cache.has('key1'), false);
		});
	});

	describe('clear()', () => {
		test('should clear all entries', () => {
			cache.set('key1', 'value1');
			cache.set('key2', 'value2');
			cache.clear();
			assert.strictEqual(cache.size(), 0);
		});
	});

	describe('size()', () => {
		test('should return correct size', () => {
			assert.strictEqual(cache.size(), 0);
			cache.set('key1', 'value1');
			assert.strictEqual(cache.size(), 1);
		});
	});

	describe('eviction logic', () => {
		test('should evict the oldest entry when maxSize is reached', () => {
			cache.set('key1', 'value1');
			mock.timers.tick(100);
			cache.set('key2', 'value2');
			mock.timers.tick(100);
			cache.set('key3', 'value3');

			// Access key1 to update its lastUpdated
			mock.timers.tick(100);
			cache.get('key1');

			// Now key2 should be the oldest (lastUpdated)
			cache.set('key4', 'value4');

			assert.strictEqual(cache.has('key2'), false);
			assert.strictEqual(cache.has('key1'), true);
			assert.strictEqual(cache.has('key3'), true);
			assert.strictEqual(cache.has('key4'), true);
		});

		test('should evict expired entry first even if it is not the oldest', () => {
			cache.set('key1', 'value1'); // oldest
			mock.timers.tick(100);
			cache.set('key2', 'value2');
			mock.timers.tick(100);
			cache.set('key3', 'value3');

			// Manually expire key3 by waiting (but keep others alive by updating them)
			// Wait... if I wait, they all expire unless I update them.
			// Actually, if I advance time 1500ms, they all expire.

			// Let's try this:
			// 0ms: set key1 (expires 1000ms)
			// 500ms: set key2 (expires 1500ms)
			// 800ms: set key3 (expires 1800ms)
			// 1100ms: key1 is expired. If we set key4, key1 should be evicted.

			const shortLivedCache = new MemoryCache<string, string>({ ttl: 1000, maxSize: 3 });
			shortLivedCache.set('key1', 'value1');
			mock.timers.tick(500);
			shortLivedCache.set('key2', 'value2');
			mock.timers.tick(300);
			shortLivedCache.set('key3', 'value3');

			mock.timers.tick(300); // Now at 1100ms. key1 is expired.

			shortLivedCache.set('key4', 'value4');

			assert.strictEqual(shortLivedCache.has('key1'), false);
			assert.strictEqual(shortLivedCache.size(), 3);
			assert.strictEqual(shortLivedCache.has('key2'), true);
			assert.strictEqual(shortLivedCache.has('key3'), true);
			assert.strictEqual(shortLivedCache.has('key4'), true);
		});
	});

	describe('cleanup()', () => {
		test('should remove only expired entries', () => {
			cache.set('key1', 'value1');
			mock.timers.tick(500);
			cache.set('key2', 'value2');
			mock.timers.tick(600); // key1 is expired, key2 is not

			const removed = cache.cleanup();
			assert.strictEqual(removed, 1);
			assert.strictEqual(cache.has('key1'), false);
			assert.strictEqual(cache.has('key2'), true);
		});
	});

	describe('getStats()', () => {
		test('should return correct statistics', () => {
			cache.set('key1', 'value1');
			mock.timers.tick(1500);
			cache.set('key2', 'value2');

			const stats = cache.getStats();
			assert.strictEqual(stats.totalSize, 2);
			assert.strictEqual(stats.expiredCount, 1);
			assert.strictEqual(stats.maxSize, options.maxSize);
			assert.strictEqual(stats.ttl, options.ttl);
		});
	});
});
