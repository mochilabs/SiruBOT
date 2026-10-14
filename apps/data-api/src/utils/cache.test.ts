import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SharedCache } from './cache.ts';

// 환경 상수와 동일한 상한 (MAX_KEYS는 모듈 밖에서 접근 불가)
const MAX_KEYS = 50_000;

type CacheInternals = {
	client: unknown;
	keyCardinality: Set<string>;
};

function internals(cache: SharedCache): CacheInternals {
	return cache as unknown as CacheInternals;
}

describe('SharedCache', () => {
	let cache: SharedCache;

	beforeEach(() => {
		cache = new SharedCache();
	});

	afterEach(async () => {
		// 메모리 폴백 맵은 모듈 레벨이라 인스턴스와 무관하게 비워요.
		await cache.disconnect();
		vi.useRealTimers();
	});

	it('메모리 폴백으로 set/get 라운드트립이 동작한다', async () => {
		await cache.set('k', 'v', 60);
		await expect(cache.get('k')).resolves.toBe('v');
		await expect(cache.get('missing')).resolves.toBeNull();
	});

	it('만료된 엔트리는 miss로 처리하고 맵에서 제거한다', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(0);
		await cache.set('k', 'v', 10);

		vi.setSystemTime(10_001);
		await expect(cache.get('k')).resolves.toBeNull();
		await expect(cache.get('k')).resolves.toBeNull();
	});

	it('카디널리티 상한에 도달하면 새 키 쓰기를 거부한다 (캐시 미스로 동작)', async () => {
		internals(cache).keyCardinality = new Set(Array.from({ length: MAX_KEYS }, (_, i) => `seed-${i}`));

		await cache.set('brand-new', 'v', 60);
		await expect(cache.get('brand-new')).resolves.toBeNull();
	});

	it('상한 도달 후에도 이미 본 키는 다시 쓸 수 있다', async () => {
		internals(cache).keyCardinality = new Set(Array.from({ length: MAX_KEYS }, (_, i) => `seed-${i}`));

		await cache.set('seed-0', 'v2', 60);
		await expect(cache.get('seed-0')).resolves.toBe('v2');
	});

	it('메모리 상한에서 만료 엔트리를 먼저 정리하고 신규 키를 받는다', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(0);
		await cache.set('purge-0', 'v', 10);

		vi.setSystemTime(1_000);
		for (let i = 1; i < MAX_KEYS; i++) {
			await cache.set(`purge-${i}`, 'v', 3_600);
		}

		internals(cache).keyCardinality.clear();
		vi.setSystemTime(10_001);
		await cache.set('brand-new', 'nv', 60);

		await expect(cache.get('purge-0')).resolves.toBeNull();
		await expect(cache.get('brand-new')).resolves.toBe('nv');
		// 만료 정리로 공간이 났으므로 만료되지 않은 항목은 제거되지 않아요
		await expect(cache.get('purge-1')).resolves.toBe('v');
	});

	it('메모리 상한에서 만료 엔트리가 없으면 가장 오래된 항목을 제거한다', async () => {
		for (let i = 0; i < MAX_KEYS; i++) {
			await cache.set(`evict-${i}`, 'v', 3_600);
		}

		internals(cache).keyCardinality.clear();
		await cache.set('brand-new', 'nv', 3_600);

		await expect(cache.get('evict-0')).resolves.toBeNull();
		await expect(cache.get('brand-new')).resolves.toBe('nv');
		await expect(cache.get('evict-1')).resolves.toBe('v');
	});

	it('Redis 명령이 실패하면 메모리 폴백으로 동작한다', async () => {
		const failingRedis = {
			isReady: true,
			async get() {
				throw new Error('redis down');
			},
			async set() {
				throw new Error('redis down');
			},
			async close() {}
		};
		internals(cache).client = failingRedis;

		await cache.set('k', 'v', 60);
		await expect(cache.get('k')).resolves.toBe('v');
	});
});
