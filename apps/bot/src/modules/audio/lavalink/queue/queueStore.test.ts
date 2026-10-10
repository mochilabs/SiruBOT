import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RedisClientType } from '@redis/client';
import { CachedQueueStore } from './queueStore.ts';

const { getSubLogger } = vi.hoisted(() => ({ getSubLogger: vi.fn() }));
const stubLogger = { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

vi.mock('@sapphire/framework', () => ({ container: { logger: { getSubLogger } } }));

function makeRedis(get: () => Promise<string | null> = async () => null) {
	const redis = {
		get: vi.fn(get),
		set: vi.fn(async (_key: string, _value: string) => undefined) as ReturnType<typeof vi.fn>,
		del: vi.fn(async (_key: string) => 0) as ReturnType<typeof vi.fn>
	};
	return { redis, handle: redis as unknown as RedisClientType };
}

const isReady = (store: CachedQueueStore) => store.getCacheStats().isRedisConnected;
const pendingCount = (store: CachedQueueStore) => store.getCacheStats().pendingWrites;

function untilReady(store: CachedQueueStore): Promise<void> {
	return vi.waitFor(() => {
		expect(isReady(store)).toBe(true);
	});
}

const QUEUE_TTL_SECONDS = 7 * 24 * 60 * 60;

describe('CachedQueueStore pending writes', () => {
	beforeEach(() => {
		getSubLogger.mockReturnValue(stubLogger);
	});

	it('keeps failed writes pending and flushes only the successful keys', async () => {
		const { redis, handle } = makeRedis();
		redis.set.mockImplementation(async (key: string) => {
			if (key.endsWith('g1')) throw new Error('still down');
		});
		const store = new CachedQueueStore(handle);
		store.onDisconnect();
		await store.set('g1', 'V1');
		await store.set('g2', 'V2');

		store.onConnect();
		await untilReady(store);

		expect(redis.set).toHaveBeenCalledWith('lavalink/queue/g2', 'V2', { EX: QUEUE_TTL_SECONDS });
		expect(pendingCount(store)).toBe(1);
	});

	it('falls back to cache and never rejects when redis get errors', async () => {
		const { handle } = makeRedis(async () => {
			throw new Error('boom');
		});
		const store = new CachedQueueStore(handle);
		const emptyQueue = JSON.stringify({ current: null, previous: [], tracks: [] });

		await expect(store.get('g1')).resolves.toBe(emptyQueue);
		expect(isReady(store)).toBe(false);

		await store.set('g1', 'V2');
		await expect(store.get('g1')).resolves.toBe('V2');
	});

	it('serves the pending value during reconnect sync and does not let redis overwrite it', async () => {
		let release!: () => void;
		let storedValue: string | null = null;
		const { redis, handle } = makeRedis(async () => storedValue ?? 'STALE-OLD');
		redis.set.mockImplementation(async (_key: string, value: string) => {
			storedValue = value;
			await new Promise<void>((resolve) => {
				release = resolve;
			});
		});
		const store = new CachedQueueStore(handle);
		store.onDisconnect();
		await store.set('g1', 'VNEW');

		store.onConnect();
		// sync가 막혀 있는 동안 get은 Redis의 과거 값이 아니라 최신 pending 값을 돌려주고,
		// redis.get으로 cache를 오염시키지 않는다.
		await expect(store.get('g1')).resolves.toBe('VNEW');
		expect(redis.get).not.toHaveBeenCalled();

		release();
		await untilReady(store);
		expect(storedValue).toBe('VNEW');
		expect(pendingCount(store)).toBe(0);
		await expect(store.get('g1')).resolves.toBe('VNEW');
	});

	it('drains writes queued while the first sync pass is in flight', async () => {
		let releaseG1!: () => void;
		const { redis, handle } = makeRedis();
		redis.set.mockImplementation(async (key: string) => {
			if (key.endsWith('g1')) {
				await new Promise<void>((resolve) => {
					releaseG1 = resolve;
				});
			}
		});
		const store = new CachedQueueStore(handle);
		store.onDisconnect();
		await store.set('g1', 'V1');

		store.onConnect();
		await store.set('g2', 'V2');
		expect(pendingCount(store)).toBe(2);

		releaseG1();
		await untilReady(store);

		expect(redis.set).toHaveBeenCalledWith('lavalink/queue/g2', 'V2', { EX: QUEUE_TTL_SECONDS });
		expect(pendingCount(store)).toBe(0);
	});

	it('does not resurrect a deleted queue after reconnect', async () => {
		let stored: string | null = 'STALE-OLD';
		const { redis, handle } = makeRedis(async () => stored);
		redis.set.mockImplementation(async (_key: string, value: string) => {
			stored = value;
		});
		redis.del.mockImplementation(async () => {
			stored = null;
			return 1;
		});
		const store = new CachedQueueStore(handle);
		store.onDisconnect();
		await store.delete('g1');

		store.onConnect();
		await untilReady(store);

		expect(redis.del).toHaveBeenCalledWith('lavalink/queue/g1');
		expect(redis.set).not.toHaveBeenCalled();
		expect(pendingCount(store)).toBe(0);

		const emptyQueue = JSON.stringify({ current: null, previous: [], tracks: [] });
		await expect(store.get('g1')).resolves.toBe(emptyQueue);
	});

	it('lets a delete during an outage override an earlier pending set', async () => {
		const { redis, handle } = makeRedis();
		const store = new CachedQueueStore(handle);
		store.onDisconnect();
		await store.set('g1', 'V1');
		await store.delete('g1');
		expect(pendingCount(store)).toBe(1);

		store.onConnect();
		await untilReady(store);

		expect(redis.set).not.toHaveBeenCalled();
		expect(redis.del).toHaveBeenCalledWith('lavalink/queue/g1');
		expect(pendingCount(store)).toBe(0);
	});

	it('lets a newer set override an earlier tombstone', async () => {
		const { redis, handle } = makeRedis();
		const store = new CachedQueueStore(handle);
		store.onDisconnect();
		await store.delete('g1');
		await store.set('g1', 'V2');

		store.onConnect();
		await untilReady(store);

		expect(redis.del).not.toHaveBeenCalled();
		expect(redis.set).toHaveBeenCalledWith('lavalink/queue/g1', 'V2', { EX: QUEUE_TTL_SECONDS });
		expect(pendingCount(store)).toBe(0);
	});
});
