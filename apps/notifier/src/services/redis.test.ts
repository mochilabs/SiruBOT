import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotifierRedis } from './redis.ts';

describe('NotifierRedis memory fallback (REDIS_URL 없이 동작하는 단일 인스턴스 경로)', () => {
	afterEach(async () => {
		// disconnect가 프로세스 메모리 폴백 저장소를 비워요. 테스트 간 상태 공유 방지.
		await new NotifierRedis().disconnect();
		vi.useRealTimers();
	});

	async function memoryOnly(): Promise<NotifierRedis> {
		const redis = new NotifierRedis();
		await redis.connect(undefined);
		return redis;
	}

	it('stays unconnected without a url', async () => {
		const redis = await memoryOnly();
		expect(redis.connected).toBe(false);
		expect(redis.getClient()).toBeNull();
	});

	it('round-trips values and honors ttl expiry in memory', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(1_700_000_000_000);
		const redis = await memoryOnly();
		await redis.set('key', 'value', 60);
		expect(await redis.get('key')).toBe('value');

		vi.advanceTimersByTime(61_000);
		expect(await redis.get('key')).toBeNull();
	});

	it('deletes keys from the memory store', async () => {
		const redis = await memoryOnly();
		await redis.set('key', 'value', 60);
		await redis.del('key');
		expect(await redis.get('key')).toBeNull();
	});

	it('counts with ttl in memory and keeps the original deadline while counting', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(1_700_000_000_000);
		const redis = await memoryOnly();
		expect(await redis.incrWithTtl('counter', 60)).toBe(1);
		expect(await redis.incrWithTtl('counter', 60)).toBe(2);

		vi.advanceTimersByTime(59_000);
		expect(await redis.incrWithTtl('counter', 60)).toBe(3);
		vi.advanceTimersByTime(2_000);
		expect(await redis.incrWithTtl('counter', 60)).toBe(1);
	});

	it('always grants the lock in memory mode (단일 인스턴스 가정)', async () => {
		const redis = await memoryOnly();
		expect(await redis.acquireLock('lock', 25)).toBe(true);
		expect(await redis.acquireLock('lock', 25)).toBe(true);
	});
});
