import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@sirubot/prisma';
import { TwitchScheduler, twitchSubscriptionStateKey } from './twitchScheduler.ts';
import type { NotifierRedis } from './redis.ts';
import type { TwitchApiClient } from './twitchApi.ts';
import type { PollOutcome } from './pollingLoop.ts';

const BROADCASTER_ID = '999888777';
const STATE_KEY = twitchSubscriptionStateKey(BROADCASTER_ID);
const NOW = 1_700_000_000_000;

type Pollable = { pollOnce(db: PrismaClient, now: number): Promise<PollOutcome> };

function makeScheduler(options: { findMany: ReturnType<typeof vi.fn>; createSubscription?: ReturnType<typeof vi.fn>; seed?: string }) {
	const store = new Map<string, string>();
	if (options.seed) store.set(STATE_KEY, options.seed);
	const redis = {
		store,
		acquireLock: vi.fn(async () => true),
		get: vi.fn(async (key: string) => store.get(key) ?? null),
		set: vi.fn(async (key: string, value: string) => {
			store.set(key, value);
		})
	};
	const db = { socialSubscription: { findMany: options.findMany } } as unknown as PrismaClient;
	const createStreamOnlineSubscription = options.createSubscription ?? vi.fn(async () => ({ subscriptionId: 'evt-sub-1' }));
	const client = { createStreamOnlineSubscription } as unknown as TwitchApiClient;
	const scheduler = new TwitchScheduler({
		redis: redis as unknown as NotifierRedis,
		getDb: () => db,
		client,
		callbackUrl: 'https://notifier.example.com/eventsub/twitch',
		eventSubSecret: 'secret',
		now: () => NOW
	});
	return { scheduler: scheduler as unknown as Pollable, db, redis, createStreamOnlineSubscription };
}

function rows(): { sourcePlatformId: string }[] {
	return [{ sourcePlatformId: BROADCASTER_ID }];
}

describe('TwitchScheduler.pollOnce', () => {
	it('counts DB failures as failed ticks instead of swallowing them as empty lists', async () => {
		const { scheduler, db, createStreamOnlineSubscription } = makeScheduler({
			findMany: vi.fn().mockRejectedValue(new Error('db down'))
		});
		await expect(scheduler.pollOnce(db, NOW)).resolves.toBe('failed');
		expect(createStreamOnlineSubscription).not.toHaveBeenCalled();
	});

	it('skips when there are no active subscriptions', async () => {
		const { scheduler, db, createStreamOnlineSubscription } = makeScheduler({ findMany: vi.fn(async () => []) });
		await expect(scheduler.pollOnce(db, NOW)).resolves.toBe('skipped');
		expect(createStreamOnlineSubscription).not.toHaveBeenCalled();
	});

	it('creates a subscription and records the state key used by the DELETE cleanup path', async () => {
		const { scheduler, db, redis, createStreamOnlineSubscription } = makeScheduler({ findMany: vi.fn(async () => rows()) });
		await expect(scheduler.pollOnce(db, NOW)).resolves.toBe('ok');
		expect(createStreamOnlineSubscription).toHaveBeenCalledWith({
			broadcasterUserId: BROADCASTER_ID,
			callbackUrl: 'https://notifier.example.com/eventsub/twitch',
			secret: 'secret'
		});
		expect(JSON.parse(redis.store.get(STATE_KEY) ?? '{}')).toMatchObject({ subscriptionId: 'evt-sub-1', createdAt: NOW });
	});

	it('renews only when the recorded subscription is older than the renewal age', async () => {
		const fresh = JSON.stringify({ subscriptionId: 'evt-sub-0', createdAt: NOW - 60_000 });
		const { scheduler, db, createStreamOnlineSubscription } = makeScheduler({ findMany: vi.fn(async () => rows()), seed: fresh });
		await expect(scheduler.pollOnce(db, NOW)).resolves.toBe('ok');
		expect(createStreamOnlineSubscription).not.toHaveBeenCalled();

		const stale = JSON.stringify({ subscriptionId: 'evt-sub-0', createdAt: NOW - 9 * 24 * 60 * 60 * 1000 });
		const renewed = makeScheduler({ findMany: vi.fn(async () => rows()), seed: stale });
		await expect(renewed.scheduler.pollOnce(renewed.db, NOW)).resolves.toBe('ok');
		expect(renewed.createStreamOnlineSubscription).toHaveBeenCalledTimes(1);
	});

	it('counts Twitch API failures as failed ticks', async () => {
		const { scheduler, db } = makeScheduler({
			findMany: vi.fn(async () => rows()),
			createSubscription: vi.fn(async () => {
				throw new Error('twitch down');
			})
		});
		await expect(scheduler.pollOnce(db, NOW)).resolves.toBe('failed');
	});
});
