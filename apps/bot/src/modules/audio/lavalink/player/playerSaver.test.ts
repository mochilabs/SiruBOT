import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RedisClientType } from '@redis/client';
import { CachedPlayerSaver } from './playerSaver.ts';
import type { CustomPlayer } from './customPlayer.ts';

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

function makePlayer(guildId: string): CustomPlayer {
	return { guildId, toJSON: () => ({ bot: {}, voice: {}, textChannelId: null }) } as unknown as CustomPlayer;
}

const isReady = (store: CachedPlayerSaver) => store.getCacheStats().isRedisConnected;
const pendingCount = (store: CachedPlayerSaver) => store.getCacheStats().pendingWrites;

function untilReady(store: CachedPlayerSaver): Promise<void> {
	return vi.waitFor(() => {
		expect(isReady(store)).toBe(true);
	});
}

describe('CachedPlayerSaver pending writes', () => {
	beforeEach(() => {
		getSubLogger.mockReturnValue(stubLogger);
	});

	it('does not resurrect a deleted player after reconnect', async () => {
		const stale = JSON.stringify({ bot: {}, voice: {}, textChannelId: '1', savedAt: 1 });
		let stored: string | null = stale;
		const { redis, handle } = makeRedis(async () => stored);
		redis.set.mockImplementation(async (_key: string, value: string) => {
			stored = value;
		});
		redis.del.mockImplementation(async () => {
			stored = null;
			return 1;
		});
		const store = new CachedPlayerSaver(handle);
		store.onDisconnect();
		await store.delete('g1');

		store.onConnect();
		await untilReady(store);

		expect(redis.del).toHaveBeenCalledWith('lavalink/player/g1');
		expect(redis.set).not.toHaveBeenCalled();
		expect(pendingCount(store)).toBe(0);
		await expect(store.get('g1')).resolves.toBeNull();
	});

	it('lets a delete during an outage override an earlier pending set', async () => {
		const { redis, handle } = makeRedis();
		const store = new CachedPlayerSaver(handle);
		store.onDisconnect();
		await store.set(makePlayer('g1'));
		await store.delete('g1');
		expect(pendingCount(store)).toBe(1);

		store.onConnect();
		await untilReady(store);

		expect(redis.set).not.toHaveBeenCalled();
		expect(redis.del).toHaveBeenCalledWith('lavalink/player/g1');
		expect(pendingCount(store)).toBe(0);
	});
});
