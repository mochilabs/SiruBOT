import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@sirubot/prisma';
import type { SocialEvent } from '@sirubot/utils';
import { ChzzkPoller } from './chzzkPoller.ts';
import type { NotifierRedis } from './redis.ts';

const CHANNEL_ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const STATE_KEY = `sirubot:social:chzzk:live:${CHANNEL_ID}`;

class FakeRedis {
	public store = new Map<string, string>();
	public acquireLock = vi.fn(async () => true);
	public get = vi.fn(async (key: string) => this.store.get(key) ?? null);
	public set = vi.fn(async (key: string, value: string) => {
		this.store.set(key, value);
	});
}

function liveResponse(isLive: boolean, liveId = 'live-9'): Response {
	return new Response(
		JSON.stringify({
			code: 200,
			content: isLive
				? { channelId: CHANNEL_ID, channelName: '시루', liveId, liveTitle: '첫방송', openLive: true, liveImageUrl: 'image_{type}.jpg' }
				: { channelId: CHANNEL_ID, channelName: '시루', openLive: false }
		}),
		{ status: 200, headers: { 'Content-Type': 'application/json' } }
	);
}

function makePoller(options: {
	fetchFn: ReturnType<typeof vi.fn>;
	seed?: string;
	now?: () => number;
	subscriptions?: { sourcePlatformId: string; sourceName?: string | null }[];
	findMany?: ReturnType<typeof vi.fn>;
}) {
	const redis = new FakeRedis();
	if (options.seed) redis.store.set(STATE_KEY, options.seed);
	const db = {
		socialSubscription: {
			findMany: options.findMany ?? vi.fn(async () => options.subscriptions ?? [{ sourcePlatformId: CHANNEL_ID }])
		}
	} as unknown as PrismaClient;
	const dispatch = vi.fn(async () => {});
	const poller = new ChzzkPoller({
		redis: redis as unknown as NotifierRedis,
		getDb: () => db,
		dispatcher: { dispatch },
		fetchFn: options.fetchFn as never,
		now: options.now ?? (() => 1_700_000_000_000)
	});
	return { poller, redis, db, dispatch };
}

async function settle(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 50));
}

describe('ChzzkPoller transitions', () => {
	it('syncs state without notifying on first observation', async () => {
		const { poller, redis, dispatch } = makePoller({ fetchFn: vi.fn(async () => liveResponse(true)) });
		poller.start();
		await vi.waitFor(() => expect(redis.set).toHaveBeenCalled());
		poller.stop();
		expect(dispatch).not.toHaveBeenCalled();
		expect(JSON.parse(redis.store.get(STATE_KEY) ?? '{}')).toMatchObject({ isLive: true, liveId: 'live-9' });
	});

	it('dispatches a bang-on event on the offline to online transition', async () => {
		const seed = JSON.stringify({ isLive: false, liveId: null, lastPolledAt: 1_700_000_000_000 - 10 * 60 * 1000 });
		const { poller, dispatch } = makePoller({ fetchFn: vi.fn(async () => liveResponse(true)), seed });
		poller.start();
		await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
		poller.stop();
		const event = (dispatch.mock.calls[0] as unknown as [SocialEvent])[0];
		expect(event).toMatchObject({
			platform: 'chzzk',
			sourceId: CHANNEL_ID,
			contentId: 'live-9',
			title: '첫방송',
			url: 'https://chzzk.naver.com/live/live-9',
			thumbnail: 'image_1080.jpg',
			author: '시루'
		});
	});

	it('falls back to the subscription name and channel url when live-status omits liveId and channelName (실측 형상)', async () => {
		const seed = JSON.stringify({ isLive: false, liveId: null, lastPolledAt: 1_700_000_000_000 - 10 * 60 * 1000 });
		const openOnly = new Response(JSON.stringify({ code: 200, content: { channelId: CHANNEL_ID, status: 'OPEN', liveTitle: '야간 방송' } }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
		const { poller, dispatch } = makePoller({
			fetchFn: vi.fn(async () => openOnly),
			seed,
			subscriptions: [{ sourcePlatformId: CHANNEL_ID, sourceName: '시룰루' }]
		});
		poller.start();
		await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
		poller.stop();
		const event = (dispatch.mock.calls[0] as unknown as [SocialEvent])[0];
		expect(event).toMatchObject({
			contentId: `${CHANNEL_ID}-1700000000000`,
			title: '야간 방송',
			url: `https://chzzk.naver.com/${CHANNEL_ID}`,
			thumbnail: null,
			author: '시룰루'
		});
	});

	it('keeps polling after a deleted channel returns 404', async () => {
		const seed = JSON.stringify({ isLive: false, liveId: null, lastPolledAt: 1_700_000_000_000 - 10 * 60 * 1000 });
		const notFound = new Response(JSON.stringify({ code: 404, message: '채널이 존재하지 않습니다.' }), { status: 404 });
		const fetchFn = vi.fn(async (input: string) => (input.includes('deleted') ? notFound : liveResponse(true)));
		const { poller, dispatch } = makePoller({
			fetchFn,
			seed,
			subscriptions: [{ sourcePlatformId: 'deleted-channel' }, { sourcePlatformId: CHANNEL_ID }]
		});
		poller.start();
		await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
		poller.stop();
	});

	it('does not trip the breaker for 404 deleted channels', async () => {
		const notFound = new Response(JSON.stringify({ code: 404, message: '채널이 존재하지 않습니다.' }), { status: 404 });
		const fetchFn = vi.fn(async () => notFound);
		const { poller } = makePoller({ fetchFn, subscriptions: [{ sourcePlatformId: 'dead-1' }, { sourcePlatformId: 'dead-2' }] });
		for (let tick = 1; tick <= 5; tick++) {
			poller.start();
			await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(tick * 2));
			poller.stop();
		}
		poller.start();
		await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(12));
		poller.stop();
	});

	it('does not notify on the online to offline transition', async () => {
		const seed = JSON.stringify({ isLive: true, liveId: 'live-9', lastPolledAt: 1_700_000_000_000 - 3 * 60 * 1000 });
		const { poller, redis, dispatch } = makePoller({ fetchFn: vi.fn(async () => liveResponse(false)), seed });
		poller.start();
		await vi.waitFor(() => expect(JSON.parse(redis.store.get(STATE_KEY) ?? '{}').isLive).toBe(false));
		poller.stop();
		expect(dispatch).not.toHaveBeenCalled();
	});

	it('skips channels polled recently according to the adaptive interval', async () => {
		const seed = JSON.stringify({ isLive: false, liveId: null, lastPolledAt: 1_700_000_000_000 - 60 * 1000 });
		const fetchFn = vi.fn(async () => liveResponse(true));
		const { poller } = makePoller({ fetchFn, seed });
		poller.start();
		await settle();
		poller.stop();
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('opens the circuit breaker after five consecutive failed ticks', async () => {
		const fetchFn = vi.fn(async () => {
			throw new Error('blocked');
		});
		const { poller } = makePoller({ fetchFn });
		for (let tick = 1; tick <= 5; tick++) {
			poller.start();
			await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(tick));
			poller.stop();
		}
		// 6번째 틱 — 브레이커가 열려 있으면 폴링 자체를 건너뛰어요.
		poller.start();
		await settle();
		poller.stop();
		expect(fetchFn).toHaveBeenCalledTimes(5);
	});

	it('counts subscription DB failures as failed ticks instead of swallowing them as an empty list', async () => {
		const findMany = vi.fn().mockRejectedValue(new Error('db down'));
		const { poller, redis } = makePoller({ fetchFn: vi.fn(), findMany });
		for (let tick = 1; tick <= 5; tick++) {
			poller.start();
			await vi.waitFor(() => expect(findMany).toHaveBeenCalledTimes(tick));
			poller.stop();
		}
		// 실패로 계정돼야 브레이커가 5틱 후 열리고 6번째 틱은 조회를 건너뛰어요.
		// (구버전은 DB 오류를 빈 목록으로 삼켜 'skipped'가 되어 브레이커에 잡히지 않았어요.)
		poller.start();
		await settle();
		poller.stop();
		expect(findMany).toHaveBeenCalledTimes(5);
		// 실패한 틱은 구독 캐시로 승격되지 않아야 해요.
		expect(redis.set).not.toHaveBeenCalled();
	});
});
