import { describe, expect, it } from 'vitest';
import { startRedisSubscribers, stopRedisSubscribers, type RedisSubscriberEntry } from './redisSubscribers.ts';

const makeEntries = (calls: string[], opts: { failStart?: string; failStop?: string } = {}): RedisSubscriberEntry[] =>
	['a', 'b', 'c'].map((name) => ({
		name,
		start: async (url) => {
			calls.push(`start:${name}:${url}`);
			if (opts.failStart === name) throw new Error('start failed');
		},
		stop: async () => {
			calls.push(`stop:${name}`);
			if (opts.failStop === name) throw new Error('stop failed');
		}
	}));

describe('redisSubscribers', () => {
	it('등록 순서대로 같은 redisUrl로 start해요', async () => {
		const calls: string[] = [];
		await startRedisSubscribers(makeEntries(calls), 'redis://x');
		expect(calls).toEqual(['start:a:redis://x', 'start:b:redis://x', 'start:c:redis://x']);
	});

	it('start 예외는 지금처럼 삼키지 않고 전파해요 (이후 서비스는 시작하지 않아요)', async () => {
		const calls: string[] = [];
		await expect(startRedisSubscribers(makeEntries(calls, { failStart: 'b' }), 'redis://x')).rejects.toThrow('start failed');
		expect(calls).toEqual(['start:a:redis://x', 'start:b:redis://x']);
	});

	it('stop은 등록 순서대로 실행하고 실패해도 다음 서비스로 넘어가요', async () => {
		const calls: string[] = [];
		await stopRedisSubscribers(makeEntries(calls, { failStop: 'a' }));
		expect(calls).toEqual(['stop:a', 'stop:b', 'stop:c']);
	});

	it('레지스트리가 없어도(셋업 전 종료) 아무 일도 하지 않아요', async () => {
		await expect(startRedisSubscribers(undefined, 'redis://x')).resolves.toBeUndefined();
		await expect(stopRedisSubscribers(undefined)).resolves.toBeUndefined();
	});
});
