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

let responseHandler: ((raw: string) => void) | null = null;
const published: string[] = [];

function makeHub(withClient = true): SocialWebhookHub {
	const fakeSubscriber = {
		connect: vi.fn(async () => {}),
		subscribe: vi.fn(async (_channel: string, handler: (raw: string) => void) => {
			responseHandler = handler;
		}),
		quit: vi.fn(async () => {})
	};
	const fakeClient = {
		duplicate: () => fakeSubscriber,
		publish: vi.fn(async (_channel: string, message: string) => {
			published.push(message);
			return 1;
		})
	};
	const redis = { getClient: () => (withClient ? fakeClient : null) } as unknown as NotifierRedis;
	return new SocialWebhookHub(redis, SIGNING_KEY);
}

describe('SocialWebhookHub', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		responseHandler = null;
		published.length = 0;
	});

	it('resolves with the correlated bot response', async () => {
		const hub = makeHub();
		const pending = hub.requestWebhookCreate(REQUEST);
		await vi.advanceTimersByTimeAsync(10);
		expect(published).toHaveLength(1);
		expect(published[0]).toBe(wrapRedisMessage(SIGNING_KEY, REQUEST));
		responseHandler?.(
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
		responseHandler?.(
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

	it('answers with an error when redis is not ready', async () => {
		const hub = makeHub(false);
		await expect(hub.requestWebhookCreate(REQUEST)).resolves.toMatchObject({ error: expect.stringContaining('Redis 연결이 없어요') });
	});

	it('rejects unsigned or malformed responses', async () => {
		const hub = makeHub();
		const pending = hub.requestWebhookCreate(REQUEST);
		await vi.advanceTimersByTimeAsync(10);
		responseHandler?.(wrapRedisMessage('다른-키', { requestId: REQUEST.requestId, guildId: REQUEST.guildId, webhookId: 'x', webhookToken: 'y' }));
		responseHandler?.('json 아님');
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
		responseHandler?.(wrapRedisMessage(SIGNING_KEY, { requestId: REQUEST.requestId, guildId: REQUEST.guildId, error: '테스트 종료' }));
		await pending;
		expect(SOCIAL_WEBHOOK_CREATE_REQUEST_CHANNEL).toBe('sirubot:social:webhook-create:request');
		expect(SOCIAL_WEBHOOK_CREATE_RESPONSE_CHANNEL).toBe('sirubot:social:webhook-create:response');
	});
});
