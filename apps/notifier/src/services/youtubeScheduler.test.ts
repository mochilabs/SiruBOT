import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@sirubot/prisma';
import { YouTubeScheduler } from './youtubeScheduler.ts';
import type { NotifierRedis } from './redis.ts';

const CHANNEL_ID = 'UCxxxxxxxxxxxxxxxxxxxxxx';
const NOW = 1_700_000_000_000;
const LEASE_KEY = `sirubot:social:youtube:lease:${CHANNEL_ID}`;
const AUDIT_KEY = `sirubot:social:youtube:audit:${CHANNEL_ID}`;

type Pollable = { pollOnce(db: PrismaClient, now: number): Promise<'ok' | 'failed' | 'skipped'> };

function feedXml(): string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015">
	<link rel="hub" href="https://pubsubhubbub.appspot.com/" />
	<title>시루 채널</title>
	<yt:channelId>${CHANNEL_ID}</yt:channelId>
	<entry>
		<title>새 영상</title>
		<link rel="alternate" href="https://www.youtube.com/watch?v=abc123" />
		<yt:videoId>abc123</yt:videoId>
		<published>2026-10-19T10:00:00.000Z</published>
		<author><name>시루</name></author>
	</entry>
</feed>`;
}

function makeScheduler(options: {
	findMany: ReturnType<typeof vi.fn>;
	fetchFn?: ReturnType<typeof vi.fn>;
	callbackUrl?: string | null;
	hubSecret?: string | null;
}) {
	const store = new Map<string, string>();
	const redis = {
		store,
		acquireLock: vi.fn(async () => true),
		get: vi.fn(async (key: string) => store.get(key) ?? null),
		set: vi.fn(async (key: string, value: string) => {
			store.set(key, value);
		})
	};
	const db = { socialSubscription: { findMany: options.findMany } } as unknown as PrismaClient;
	const fetchFn = options.fetchFn ?? vi.fn(async () => new Response(feedXml(), { status: 200 }));
	const dispatch = vi.fn(async () => {});
	const scheduler = new YouTubeScheduler({
		redis: redis as unknown as NotifierRedis,
		getDb: () => db,
		dispatcher: { dispatch },
		callbackUrl: options.callbackUrl ?? null,
		hubSecret: options.hubSecret ?? null,
		fetchFn: fetchFn as never,
		now: () => NOW
	});
	return { scheduler: scheduler as unknown as Pollable, db, redis, fetchFn, dispatch };
}

describe('YouTubeScheduler.pollOnce', () => {
	it('counts DB failures as failed ticks so silent lease loss is visible to the breaker', async () => {
		const { scheduler, db, fetchFn } = makeScheduler({ findMany: vi.fn().mockRejectedValue(new Error('db down')) });
		await expect(scheduler.pollOnce(db, NOW)).resolves.toBe('failed');
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('skips when there are no active subscriptions', async () => {
		const { scheduler, db } = makeScheduler({ findMany: vi.fn(async () => []) });
		await expect(scheduler.pollOnce(db, NOW)).resolves.toBe('skipped');
	});

	it('audits the RSS feed and dispatches entries when the push is not configured', async () => {
		const { scheduler, db, redis, fetchFn, dispatch } = makeScheduler({
			findMany: vi.fn(async () => [{ sourcePlatformId: CHANNEL_ID }])
		});
		await expect(scheduler.pollOnce(db, NOW)).resolves.toBe('ok');
		expect(fetchFn).toHaveBeenCalledTimes(1);
		await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
		expect((dispatch.mock.calls[0] as unknown as [Record<string, unknown>])[0]).toMatchObject({ platform: 'youtube', contentId: 'abc123' });
		expect(redis.store.has(AUDIT_KEY)).toBe(true);
	});

	it('renews the WebSub lease when it is missing and records it in redis', async () => {
		const fetchFn = vi.fn(async (url: string) =>
			url.includes('pubsubhubbub') ? new Response(null, { status: 202 }) : new Response(feedXml(), { status: 200 })
		);
		const { scheduler, db, redis } = makeScheduler({
			findMany: vi.fn(async () => [{ sourcePlatformId: CHANNEL_ID }]),
			fetchFn,
			callbackUrl: 'https://notifier.example.com/pubsub/youtube',
			hubSecret: 'hub-secret'
		});
		await expect(scheduler.pollOnce(db, NOW)).resolves.toBe('ok');
		expect(JSON.parse(redis.store.get(LEASE_KEY) ?? '{}')).toMatchObject({ leaseUntil: NOW + 432_000_000 });
	});

	it('does not re-subscribe while the remaining lease is far from expiry', async () => {
		const { scheduler, db, fetchFn } = makeScheduler({
			findMany: vi.fn(async () => [{ sourcePlatformId: CHANNEL_ID }]),
			fetchFn: vi.fn(async () => new Response(feedXml(), { status: 200 })),
			callbackUrl: 'https://notifier.example.com/pubsub/youtube',
			hubSecret: 'hub-secret'
		});
		// 남은 lease가 갱신 임계(24h)보다 넉넉하면 hub 재등록 없이 RSS 감사만 돌아요.
		await scheduler.pollOnce(db, NOW); // 1회: lease 기록
		const hubCalls = fetchFn.mock.calls.filter(([url]) => String(url).includes('pubsubhubbub')).length;
		await scheduler.pollOnce(db, NOW);
		expect(fetchFn.mock.calls.filter(([url]) => String(url).includes('pubsubhubbub'))).toHaveLength(hubCalls);
	});
});
