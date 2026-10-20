import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient, SocialSubscription } from '@sirubot/prisma';
import type { SocialEvent } from '@sirubot/utils';
import { SocialDispatcher } from './dispatcher.ts';
import type { NotifierRedis } from './redis.ts';

const EVENT: SocialEvent = {
	platform: 'chzzk',
	sourceId: 'ch-source-1',
	contentId: 'live-1',
	title: '방송 시작했어요!',
	url: 'https://chzzk.naver.com/live/1',
	thumbnail: 'https://image.example.com/thumb.jpg',
	author: '시루',
	publishedAt: Date.now()
};

class FakeRedis {
	public counters = new Map<string, number>();
	public del = vi.fn(async (key: string) => {
		this.counters.delete(key);
	});
	public incrWithTtl = vi.fn(async (key: string) => {
		const next = (this.counters.get(key) ?? 0) + 1;
		this.counters.set(key, next);
		return next;
	});
}

function makeSubscription(overrides: Partial<SocialSubscription> = {}): SocialSubscription {
	return {
		id: 'sub-1',
		guildId: '123456789012345678',
		platform: 'chzzk',
		sourcePlatformId: 'ch-source-1',
		sourceName: '시루',
		targetChannelId: '987654321098765432',
		webhookId: 'wh-1',
		webhookToken: 'webhook-token-value',
		messageTemplate: null,
		status: 'active',
		createdAt: new Date(0),
		updatedAt: new Date(0),
		...overrides
	} as SocialSubscription;
}

function makeDb(
	overrides: { findUnique?: () => unknown; create?: () => unknown; findMany?: () => unknown; update?: () => unknown } = {}
): PrismaClient {
	return {
		socialEventLog: {
			findUnique: vi.fn(overrides.findUnique ?? (async () => null)),
			create: vi.fn(overrides.create ?? (async () => ({})))
		},
		socialSubscription: {
			findMany: vi.fn(overrides.findMany ?? (async () => [makeSubscription()])),
			update: vi.fn(overrides.update ?? (async () => ({})))
		}
	} as unknown as PrismaClient;
}

function makeDispatcher(db: PrismaClient | null, redis: NotifierRedis, fetchFn?: ReturnType<typeof vi.fn>): SocialDispatcher {
	return new SocialDispatcher({ getDb: () => db, redis, fetchFn: fetchFn as never });
}

describe('SocialDispatcher.dispatch', () => {
	it('does nothing without a database connection', async () => {
		const redis = new FakeRedis() as unknown as NotifierRedis;
		const fetchFn = vi.fn();
		await makeDispatcher(null, redis, fetchFn).dispatch(EVENT);
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('skips an event that was already delivered', async () => {
		const redis = new FakeRedis() as unknown as NotifierRedis;
		const db = makeDb({ findUnique: async () => ({ id: 'log-1' }) });
		await makeDispatcher(db, redis, vi.fn()).dispatch(EVENT);
		expect(db.socialEventLog.findUnique).toHaveBeenCalled();
		expect(db.socialEventLog.create).not.toHaveBeenCalled();
		expect(db.socialSubscription.findMany).not.toHaveBeenCalled();
	});

	it('skips fanout when a concurrent insert wins the dedup race', async () => {
		const redis = new FakeRedis() as unknown as NotifierRedis;
		const db = makeDb({
			create: async () => {
				throw new Error('Unique constraint failed');
			}
		});
		await makeDispatcher(db, redis, vi.fn()).dispatch(EVENT);
		expect(db.socialSubscription.findMany).not.toHaveBeenCalled();
	});

	it('delivers to every matching active subscription and resets the failure counter', async () => {
		const redis = new FakeRedis() as unknown as NotifierRedis;
		const db = makeDb({
			findMany: async () => [makeSubscription(), makeSubscription({ id: 'sub-2', webhookId: 'wh-2', webhookToken: 'tok-2' })]
		});
		const fetchFn = vi.fn(async () => new Response('', { status: 200 }));
		await makeDispatcher(db, redis, fetchFn).dispatch(EVENT);
		expect(fetchFn).toHaveBeenCalledTimes(2);
		const [url] = fetchFn.mock.calls[0] as unknown as [string];
		expect(url).toBe('https://discord.com/api/webhooks/wh-1/webhook-token-value');
		const payload = JSON.parse((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
		expect(payload.embeds[0].author.name).toBe('시루');
		expect(payload.allowed_mentions).toEqual({ parse: [] });
		expect(redis.del).toHaveBeenCalledWith('sirubot:social:delivery-fail:sub-1');
	});

	it('renders custom content and whitelists only mentioned roles', () => {
		const redis = new FakeRedis() as unknown as NotifierRedis;
		const dispatcher = makeDispatcher(makeDb(), redis);
		const subscription = makeSubscription({ messageTemplate: '{title} 올라옴! <@&192837465051627384>' });
		const payload = dispatcher.buildPayload(subscription, EVENT);
		expect(payload.content).toBe('방송 시작했어요! 올라옴! <@&192837465051627384>');
		expect(payload.allowed_mentions).toEqual({ parse: [], roles: ['192837465051627384'] });
	});

	it('marks the subscription failed immediately on dead webhooks (404)', async () => {
		const redis = new FakeRedis() as unknown as NotifierRedis;
		const update = vi.fn(async () => ({}));
		const db = makeDb({ update });
		const fetchFn = vi.fn(async () => new Response('', { status: 404 }));
		await makeDispatcher(db, redis, fetchFn).dispatch(EVENT);
		expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'failed' } }));
	});

	it('retries once after a 429 and succeeds', async () => {
		const redis = new FakeRedis() as unknown as NotifierRedis;
		const update = vi.fn(async () => ({}));
		const db = makeDb({ update });
		let callCount = 0;
		const fetchFn = vi.fn(async () => {
			callCount++;
			return callCount === 1 ? new Response('', { status: 429, headers: { 'retry-after': '0.01' } }) : new Response('', { status: 200 });
		});
		await makeDispatcher(db, redis, fetchFn).dispatch(EVENT);
		expect(fetchFn).toHaveBeenCalledTimes(2);
		expect(redis.del).toHaveBeenCalledWith('sirubot:social:delivery-fail:sub-1');
		expect(update).not.toHaveBeenCalled();
	});

	it('marks the subscription failed after five consecutive delivery failures', async () => {
		const redis = new FakeRedis() as unknown as NotifierRedis;
		const update = vi.fn(async () => ({}));
		const db = makeDb({ update });
		const fetchFn = vi.fn(async () => new Response('', { status: 500 }));
		const dispatcher = makeDispatcher(db, redis, fetchFn);
		for (let round = 1; round <= 5; round++) {
			await dispatcher.dispatch({ ...EVENT, contentId: `live-${round}` });
			if (round < 5) expect(update).not.toHaveBeenCalled();
		}
		expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'failed' } }));
	});
});
