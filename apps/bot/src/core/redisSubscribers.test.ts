import type { ManagedRedisSubscriberOptions } from '@sirubot/utils';
import { describe, expect, it, vi } from 'vitest';
import type { RedisBinding } from '../lib/redisResponder.ts';
import { createSharedRedisSubscriber, startRedisSubscribers, stopRedisSubscribers, type RedisSubscriberEntry } from './redisSubscribers.ts';

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

describe('createSharedRedisSubscriber', () => {
	const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() });
	const makeBinding = (channel: string, handle = vi.fn(async () => undefined)): RedisBinding => ({ name: channel, channel, handle });

	const setup = (bindings: RedisBinding[]) => {
		const created: ManagedRedisSubscriberOptions[] = [];
		const start = vi.fn(async () => undefined);
		const stop = vi.fn(async () => undefined);
		const log = logger();
		const runtime = { logger: log, signingKey: '', publisher: { publish: vi.fn() }, resolveGuild: () => undefined };
		const entry = createSharedRedisSubscriber({
			name: '대시보드 연동',
			logger: log,
			runtime,
			bindings,
			createSubscriber: (options) => {
				created.push(options);
				return { start, stop };
			}
		});
		return { entry, created, start, stop, log, runtime };
	};

	it('start는 연결 하나에 모든 채널을 묶어서 구독해요', async () => {
		const { entry, created, start } = setup([makeBinding('a'), makeBinding('b'), makeBinding('c')]);
		await entry.start('redis://x');
		expect(created).toHaveLength(1);
		expect(created[0].url).toBe('redis://x');
		expect(created[0].bindings.map((b) => b.channel)).toEqual(['a', 'b', 'c']);
		expect(start).toHaveBeenCalledTimes(1);
	});

	it('수신 메시지를 해당 바인딩의 handle에 런타임과 함께 넘겨요', async () => {
		const handleA = vi.fn(async () => undefined);
		const { entry, created, runtime } = setup([makeBinding('a', handleA), makeBinding('b')]);
		await entry.start('redis://x');
		created[0].bindings[0].onMessage('payload');
		expect(handleA).toHaveBeenCalledWith('payload', runtime);
	});

	it('REDIS_URL이 비어 있으면 구독 없이 경고만 남기고 돌아와요', async () => {
		const { entry, created, log } = setup([makeBinding('a')]);
		await entry.start('   ');
		expect(created).toHaveLength(0);
		expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('REDIS_URL'));
	});

	it('stop은 구독 연결을 한 번만 닫고, start 전이나 중복 호출에도 안전해요', async () => {
		const { entry, stop } = setup([makeBinding('a')]);
		await expect(entry.stop()).resolves.toBeUndefined();
		expect(stop).not.toHaveBeenCalled();
		await entry.start('redis://x');
		await entry.stop();
		await entry.stop();
		expect(stop).toHaveBeenCalledTimes(1);
	});

	it('stopRedisSubscribers가 shutdown 경로로 이 엔트리를 정리해요', async () => {
		const { entry, stop } = setup([makeBinding('a')]);
		await startRedisSubscribers([entry], 'redis://x');
		await stopRedisSubscribers([entry]);
		expect(stop).toHaveBeenCalledTimes(1);
	});
});
