import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { wrapRedisMessage } from '@sirubot/utils/redisEnvelope';
import { sharedCache } from './cache.ts';
import { createRequestReplyHub } from './requestReplyHub.ts';

/** HubSubscriber를 가로채 onMessage·start·stop 호출만 관찰해요 — Redis 연결 없이 구독 메시지 경로를 검증해요 */
const subscriberState = vi.hoisted(() => ({
	options: null as null | { name: string; channel: string; onMessage: (message: string, channel: string) => void },
	start: vi.fn(async () => undefined),
	stop: vi.fn(async () => undefined)
}));
vi.mock('./hubSubscriber.ts', () => ({
	HubSubscriber: class {
		public isSubscribed = true;
		public constructor(options: NonNullable<typeof subscriberState.options>) {
			subscriberState.options = options;
		}
		public start = subscriberState.start;
		public stop = subscriberState.stop;
	}
}));

const responseSchema = z.object({ requestId: z.string(), guildId: z.string(), error: z.string().optional() });
type Response = z.infer<typeof responseSchema>;
type Meta = { guildId: string };
type Result = { ok: true } | { ok: false; reason: 'redis_unavailable' | 'timeout' | 'bot_error' };

const REQUEST_ID = 'c9d3a1b2-4e5f-4a6b-8c7d-2b1e3f4a5c61';
const OTHER_REQUEST_ID = 'a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c51';
const GUILD_ID = '123456789012345678';
const logger = { warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn() };

function makeHub(capacity = 10) {
	return createRequestReplyHub<Response, Meta, Result>({
		name: 'test hub',
		label: 'test',
		mismatch: 'guildId mismatch',
		requestLabel: 'Test request',
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		logger: logger as any,
		requestChannel: 'test:request',
		responseChannel: 'test:response',
		responseSchema,
		capacity,
		matches: (response, meta) => response.guildId === meta.guildId,
		toResult: (response) => (response.error ? { ok: false, reason: 'bot_error' } : { ok: true }),
		timeoutResult: () => ({ ok: false, reason: 'timeout' }),
		unavailableResult: () => ({ ok: false, reason: 'redis_unavailable' })
	});
}

function call(requestId = REQUEST_ID, timeoutMs = 10_000) {
	return { requestId, payload: { requestId, guildId: GUILD_ID }, meta: { guildId: GUILD_ID }, timeoutMs, logContext: GUILD_ID };
}

function fakeClient(publish: () => Promise<number>) {
	const client = { publish: vi.fn(publish) };
	vi.spyOn(sharedCache, 'getClient').mockReturnValue(client as never);
	return client;
}

const reply = (requestId: string, guildId = GUILD_ID) => JSON.stringify({ requestId, guildId });

describe('createRequestReplyHub', () => {
	beforeEach(() => {
		vi.stubEnv('AUTH_KEY', '');
		vi.stubEnv('REDIS_AUTH_KEY', '');
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		vi.clearAllMocks();
	});

	it('resolves a pending request on a matching response and publishes the signed envelope on the request channel', async () => {
		const client = fakeClient(async () => 1);
		const hub = makeHub();
		const promise = hub.request(call());
		await vi.waitFor(() => expect(client.publish).toHaveBeenCalledTimes(1));
		expect(client.publish).toHaveBeenCalledWith('test:request', JSON.stringify({ requestId: REQUEST_ID, guildId: GUILD_ID }));
		expect(hub.status()).toEqual({ pending: 1, subscribed: true });

		expect(hub.correlate(reply(REQUEST_ID))).toBe('resolved');
		await expect(promise).resolves.toEqual({ ok: true });
		expect(hub.status().pending).toBe(0);
	});

	it('ignores a response whose meta does not match and lets the request time out', async () => {
		vi.useFakeTimers();
		fakeClient(async () => 1);
		const hub = makeHub();
		const promise = hub.request(call(REQUEST_ID, 1_000));

		expect(hub.correlate(reply(REQUEST_ID, '999999999999999999'))).toBe('unmatched');
		expect(hub.correlate(reply(OTHER_REQUEST_ID))).toBe('unmatched');
		expect(hub.correlate('not json')).toBe('malformed');
		expect(hub.status().pending).toBe(1);

		await vi.advanceTimersByTimeAsync(1_000);
		await expect(promise).resolves.toEqual({ ok: false, reason: 'timeout' });
		expect(hub.status().pending).toBe(0);
	});

	it('ignores a response with an invalid signature received on the subscribed channel', async () => {
		vi.stubEnv('AUTH_KEY', 'shared-key');
		vi.useFakeTimers();
		fakeClient(async () => 1);
		const hub = makeHub();
		const promise = hub.request(call(REQUEST_ID, 1_000));
		const { options } = subscriberState;
		expect(options?.channel).toBe('test:response');

		// 서명 없는 위조 본문은 상관하지 않아요
		options?.onMessage(reply(REQUEST_ID), 'test:response');
		expect(logger.warn).toHaveBeenCalledWith('Rejected test response with invalid signature');
		expect(hub.status().pending).toBe(1);

		// 올바른 서명 봉투는 상관해요
		options?.onMessage(wrapRedisMessage('shared-key', { requestId: REQUEST_ID, guildId: GUILD_ID }), 'test:response');
		await expect(promise).resolves.toEqual({ ok: true });
	});

	it('returns the timeout result when no response arrives', async () => {
		vi.useFakeTimers();
		fakeClient(async () => 1);
		const hub = makeHub();
		const promise = hub.request(call(REQUEST_ID, 500));
		await vi.advanceTimersByTimeAsync(500);
		await expect(promise).resolves.toEqual({ ok: false, reason: 'timeout' });
	});

	it('fails a request over capacity immediately with the timeout result and cleans its meta', async () => {
		fakeClient(async () => 1);
		const hub = makeHub(1);
		const first = hub.request(call(REQUEST_ID));
		const second = await hub.request(call(OTHER_REQUEST_ID));
		expect(second).toEqual({ ok: false, reason: 'timeout' });
		expect(hub.status().pending).toBe(1);

		// 용량 초과로 정리된 요청의 메타는 남지 않아 늦은 응답도 unmatched예요
		expect(hub.correlate(reply(OTHER_REQUEST_ID))).toBe('unmatched');
		expect(hub.correlate(reply(REQUEST_ID))).toBe('resolved');
		await expect(first).resolves.toEqual({ ok: true });
	});

	it('cleans up pending and meta when publish fails and resolves redis_unavailable', async () => {
		fakeClient(async () => {
			throw new Error('boom');
		});
		const hub = makeHub();
		await expect(hub.request(call())).resolves.toEqual({ ok: false, reason: 'redis_unavailable' });
		expect(hub.status().pending).toBe(0);
		expect(logger.warn).toHaveBeenCalledWith(`Test request publish failed (${GUILD_ID}): boom`);
		// 메타가 정리돼 늦게 도착한 응답은 무시돼요
		expect(hub.correlate(reply(REQUEST_ID))).toBe('unmatched');
	});

	it('fails with redis_unavailable and registers nothing when there is no redis client', async () => {
		vi.spyOn(sharedCache, 'getClient').mockReturnValue(null);
		const hub = makeHub();
		await expect(hub.request(call())).resolves.toEqual({ ok: false, reason: 'redis_unavailable' });
		expect(hub.status().pending).toBe(0);
	});

	it('start without a redis url warns and does not subscribe; with a url it delegates to the subscriber', async () => {
		const hub = makeHub();
		await hub.start(undefined);
		expect(subscriberState.start).not.toHaveBeenCalled();
		expect(logger.warn).toHaveBeenCalledWith(
			'REDIS_URL is not set, test hub will not receive responses (all requests fail as redis_unavailable)'
		);

		await hub.start('redis://localhost:6379');
		expect(subscriberState.start).toHaveBeenCalledWith('redis://localhost:6379');
		await hub.stop();
		expect(subscriberState.stop).toHaveBeenCalledTimes(1);
	});
});
