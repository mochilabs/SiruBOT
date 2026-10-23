import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SOCIAL_WEBHOOK_CREATE_REQUEST_CHANNEL, SOCIAL_WEBHOOK_CREATE_RESPONSE_CHANNEL } from '@sirubot/utils';
import { wrapRedisMessage } from '@sirubot/utils/redisEnvelope';
import { SocialWebhookHub } from './webhookHub.ts';
import type { NotifierRedis } from './redis.ts';

const SIGNING_KEY = 'signing-key';
const REQUEST = {
	requestId: 'd7a1f3c5-2b8e-4a9d-8f61-3c2b5e7a9d41',
	guildId: '123456789012345678',
	targetChannelId: '987654321098765432',
	name: '시루 소셜 알림'
};

/** ManagedRedisSubscriber가 createClient로 만드는 구독 전용 클라이언트 목: 응답 핸들러 캡처용 */
const fakeRedis = vi.hoisted(() => {
	const state = {
		responseHandler: null as ((raw: string) => void) | null,
		published: [] as string[]
	};
	const subscriber = {
		on: vi.fn(),
		connect: vi.fn(async () => {}),
		subscribe: vi.fn(async (_channel: string, handler: (raw: string) => void) => {
			state.responseHandler = handler;
		}),
		unsubscribe: vi.fn(async () => {}),
		quit: vi.fn(async () => {})
	};
	return { state, subscriber };
});

// 공용 ManagedRedisSubscriber가 여는 구독 전용 연결을 목으로 대체해요. 실제 구독 라이프사이클(connect→subscribe)은 그대로 태워요.
vi.mock('@redis/client', () => ({
	createClient: vi.fn(() => fakeRedis.subscriber)
}));

function makeHub(withRedis = true): SocialWebhookHub {
	const fakeClient = {
		publish: vi.fn(async (_channel: string, message: string) => {
			fakeRedis.state.published.push(message);
			return 1;
		})
	};
	const redis = { getClient: () => (withRedis ? fakeClient : null) } as unknown as NotifierRedis;
	return new SocialWebhookHub(redis, SIGNING_KEY, withRedis ? 'redis://notifier.test:6379' : undefined);
}

describe('SocialWebhookHub', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		fakeRedis.state.responseHandler = null;
		fakeRedis.state.published.length = 0;
		fakeRedis.subscriber.subscribe.mockClear();
		fakeRedis.subscriber.unsubscribe.mockClear();
		fakeRedis.subscriber.quit.mockClear();
	});

	it('resolves with the correlated bot response', async () => {
		const hub = makeHub();
		const pending = hub.requestWebhookCreate(REQUEST);
		await vi.advanceTimersByTimeAsync(10);
		expect(fakeRedis.state.published).toHaveLength(1);
		expect(fakeRedis.state.published[0]).toBe(wrapRedisMessage(SIGNING_KEY, REQUEST));
		fakeRedis.state.responseHandler?.(
			wrapRedisMessage(SIGNING_KEY, {
				requestId: REQUEST.requestId,
				guildId: REQUEST.guildId,
				webhookId: '0192837465f1e2d3c4',
				webhookToken: 'webhook-token-abcdefghijklmnopqrstuvwxyz'
			})
		);
		await expect(pending).resolves.toMatchObject({ requestId: REQUEST.requestId, webhookId: '0192837465f1e2d3c4' });
		await hub.stop();
	});

	it('ignores responses for unknown request ids', async () => {
		const hub = makeHub();
		const pending = hub.requestWebhookCreate(REQUEST);
		await vi.advanceTimersByTimeAsync(10);
		fakeRedis.state.responseHandler?.(
			wrapRedisMessage(SIGNING_KEY, {
				requestId: '00000000-0000-4000-8000-000000000000',
				guildId: REQUEST.guildId,
				webhookId: 'other',
				webhookToken: 'another-webhook-token-value'
			})
		);
		await vi.advanceTimersByTimeAsync(5_100);
		await expect(pending).resolves.toMatchObject({ error: expect.stringContaining('봇이 응답하지 않았어요') });
		await hub.stop();
	});

	it('keeps the guild id in timeout payloads (타임아웃 회수 후에도 요청의 길드 정보를 싣어요)', async () => {
		const hub = makeHub();
		const pending = hub.requestWebhookCreate(REQUEST);
		await vi.advanceTimersByTimeAsync(10);
		await vi.advanceTimersByTimeAsync(5_100);
		await expect(pending).resolves.toMatchObject({
			requestId: REQUEST.requestId,
			guildId: REQUEST.guildId,
			error: expect.stringContaining('봇이 응답하지 않았어요')
		});
		await hub.stop();
	});

	it('answers with an error when redis is not ready', async () => {
		const hub = makeHub(false);
		await expect(hub.requestWebhookCreate(REQUEST)).resolves.toMatchObject({ error: expect.stringContaining('Redis 연결이 없어요') });
	});

	it('rejects unsigned or malformed responses', async () => {
		const hub = makeHub();
		const pending = hub.requestWebhookCreate(REQUEST);
		await vi.advanceTimersByTimeAsync(10);
		fakeRedis.state.responseHandler?.(
			wrapRedisMessage('다른-키', { requestId: REQUEST.requestId, guildId: REQUEST.guildId, webhookId: 'x', webhookToken: 'y' })
		);
		fakeRedis.state.responseHandler?.('json 아님');
		await vi.advanceTimersByTimeAsync(5_100);
		await expect(pending).resolves.toMatchObject({ error: expect.stringContaining('봇이 응답하지 않았어요') });
		await hub.stop();
	});

	it('resolves pending requests when the service shuts down', async () => {
		const hub = makeHub();
		const pending = hub.requestWebhookCreate(REQUEST);
		await vi.advanceTimersByTimeAsync(10);
		await hub.stop();
		await expect(pending).resolves.toMatchObject({ error: '서비스가 종료되고 있어요.' });
	});

	it('publishes on the request channel and subscribes on the response channel', async () => {
		const hub = makeHub();
		const pending = hub.requestWebhookCreate(REQUEST);
		await vi.advanceTimersByTimeAsync(10);
		fakeRedis.state.responseHandler?.(
			wrapRedisMessage(SIGNING_KEY, { requestId: REQUEST.requestId, guildId: REQUEST.guildId, error: '테스트 종료' })
		);
		await pending;
		expect(SOCIAL_WEBHOOK_CREATE_REQUEST_CHANNEL).toBe('sirubot:social:webhook-create:request');
		expect(SOCIAL_WEBHOOK_CREATE_RESPONSE_CHANNEL).toBe('sirubot:social:webhook-create:response');
		expect(fakeRedis.subscriber.subscribe).toHaveBeenCalledWith(SOCIAL_WEBHOOK_CREATE_RESPONSE_CHANNEL, expect.any(Function));
	});
});
