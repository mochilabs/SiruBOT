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
});

/**
 * Fatal #4 회귀 가드: 포화 상태 삽입이 O(n) 전수조사가 아니라 O(1) LRU여야 해요.
 * 벤치는 wall time으로 O(n²) vs O(1) 차이를 수치로 검증해요.
 */

// 구현 전 코드(evictOldest가 Map 전체 순회) — 벤치 기준선으로만 사용하는 사본이에요.
class LegacyMemoryCache<Key, Value> {
	private cache = new Map<Key, { data: Value; expiresAt: number; lastUpdated: number }>();

	public constructor(private readonly options: { ttl: number; maxSize: number }) {}

	public set(key: Key, value: Value) {
		if (!this.cache.has(key) && this.cache.size >= this.options.maxSize) {
			this.evictOldest();
		}

		const now = Date.now();
		this.cache.set(key, { data: value, expiresAt: now + this.options.ttl, lastUpdated: now });
	}

	public get(key: Key): Value | undefined {
		const entry = this.cache.get(key);
		if (!entry) return undefined;

		if (entry.expiresAt < Date.now()) {
			this.cache.delete(key);
			return undefined;
		}

		entry.lastUpdated = Date.now();
		return entry.data;
	}

	public size(): number {
		return this.cache.size;
	}

	private evictOldest(): void {
		let oldestKey: Key | undefined;
		let oldestTime = Number.POSITIVE_INFINITY;

		for (const [key, entry] of this.cache.entries()) {
			if (entry.expiresAt < Date.now()) {
				this.cache.delete(key);
				return;
			}

			if (entry.lastUpdated < oldestTime) {
				oldestTime = entry.lastUpdated;
				oldestKey = key;
			}
		}

		if (oldestKey !== undefined) {
			this.cache.delete(oldestKey);
		}
	}
}

function runSaturationWorkload(
	cache: { set(key: string, value: number): void; get(key: string): number | undefined; size(): number },
	operations: number,
	maxSize: number
): number {
	const startedAt = performance.now();

	// 포화 상태 신규 키 삽입 워크로드, 매 삽입이 eviction을 유발해요.
	for (let i = 0; i < operations; i++) {
		cache.set(`key-${i}`, i);
	}

	for (let i = 0; i < operations; i++) {
		cache.get(`key-${i}`);
	}

	expect(cache.size()).toBeLessThanOrEqual(maxSize);

	return performance.now() - startedAt;
}

describe('MemoryCache LRU', () => {
	it('evicts the least recently used entry and promotes recently read entries', () => {
		const cache = new MemoryCache<string, number>({ ttl: 60_000, maxSize: 3 });
		cache.set('a', 1);
		cache.set('b', 2);
		cache.set('c', 3);

		// a를 읽어 맨 뒤로 승격 → 오래 안 쓴 건 b가 되어야 해요.
		expect(cache.get('a')).toBe(1);

		cache.set('d', 4);
		expect(cache.size()).toBe(3);
		expect(cache.has('b')).toBe(false);
		expect(cache.get('a')).toBe(1);
		expect(cache.get('c')).toBe(3);
		expect(cache.get('d')).toBe(4);
	});

	it('keeps insertion order eviction when entries are never read', () => {
		const cache = new MemoryCache<string, number>({ ttl: 60_000, maxSize: 2 });
		cache.set('a', 1);
		cache.set('b', 2);
		cache.set('c', 3);
		expect(cache.has('a')).toBe(false);
		expect(cache.get('b')).toBe(2);
		expect(cache.get('c')).toBe(3);
	});

	it('does not evict when updating an existing key at capacity', () => {
		const cache = new MemoryCache<string, number>({ ttl: 60_000, maxSize: 2 });
		cache.set('a', 1);
		cache.set('b', 2);
		cache.set('a', 10);
		expect(cache.size()).toBe(2);
		expect(cache.get('a')).toBe(10);
		expect(cache.get('b')).toBe(2);
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

	it('expires entries after ttl even after LRU promotions', () => {
		vi.useFakeTimers();
		try {
			const cache = new MemoryCache<string, number>({ ttl: 1000, maxSize: 10 });
			cache.set('a', 1);
			for (let i = 0; i < 5; i++) {
				expect(cache.get('a')).toBe(1); // 반복 승격이 만료를 연장하면 안 돼요.
			}
			vi.setSystemTime(Date.now() + 1001);
			expect(cache.get('a')).toBeUndefined();
			expect(cache.has('a')).toBe(false);
			expect(cache.size()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});

	it('handles 10,000 saturated set/get operations in O(1) per op (vs legacy O(n) scan)', () => {
		const maxSize = 5_000;
		const operations = 10_000;

		const legacy = new LegacyMemoryCache<string, number>({ ttl: 3_600_000, maxSize });
		const legacyMs = runSaturationWorkload(legacy, operations, maxSize);

		const cache = new MemoryCache<string, number>({ ttl: 3_600_000, maxSize });
		const currentMs = runSaturationWorkload(cache, operations, maxSize);

		// 벤치 수치를 리포트에서 확인할 수 있게 출력해요.
		console.info(
			`[memoryCache bench] legacy O(n) scan: ${legacyMs.toFixed(1)}ms, LRU O(1): ${currentMs.toFixed(1)}ms, speedup: ${(legacyMs / currentMs).toFixed(1)}x`
		);

		// 절대 시간은 기계에 따라 달라 널리 여유를 두되, 포화 상태 20,000회가 밀리초 수준이어야 O(1) 근사임을 보장해요.
		expect(currentMs).toBeLessThan(500);
		// 동일 워크로드 기준으로 legacy 대비 실질적으로 압도적으로 빨라야 해요.
		expect(legacyMs).toBeGreaterThan(100);
		expect(currentMs * 3).toBeLessThan(legacyMs);
	}, 60_000);
});
