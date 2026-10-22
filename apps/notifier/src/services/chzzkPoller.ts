import type { PrismaClient } from '@sirubot/prisma';
import type { SocialEvent } from '@sirubot/utils';
import { ChzzkApiError, fetchChzzkLiveStatus, fetchChzzkLiveThumbnail, type ChzzkLiveStatus, type FetchFn } from './chzzkApi.ts';
import { BREAKER_THRESHOLD, SubscriptionPoller, type PollOutcome } from './pollingLoop.ts';
import type { NotifierRedis } from './redis.ts';
import { getLogger } from '../utils/logger.ts';

const logger = getLogger('chzzkPoller');

// 틱 주기 — 개별 채널은 due 계산으로 실제 폴링 주기가 갈려요.
const TICK_MS = 30_000;
const LOCK_KEY = 'sirubot:social:chzzk:poll-lock';
const LOCK_TTL_SECONDS = 25;
const STATE_KEY_PREFIX = 'sirubot:social:chzzk:live:';
const STATE_TTL_SECONDS = 7 * 24 * 60 * 60;
// plan §8 — 라이브 중 2분, 오프라인 5분 (적응형 폴링)
const INTERVAL_ONLINE_MS = 2 * 60 * 1000;
const INTERVAL_OFFLINE_MS = 5 * 60 * 1000;
// 구독 목록 캐시 — 매 틱마다 DB를 때리지 않아요.
const SUBSCRIPTION_CACHE_MS = 60_000;

interface ChannelState {
	isLive: boolean;
	liveId: string | null;
	lastPolledAt: number;
}

/** 폴링 대상 채널 — 이벤트 author 폴백에 구독 시점의 채널 이름을 써요. */
export interface PolledChzzkChannel {
	sourcePlatformId: string;
	sourceName: string | null;
}

/** 치지직 뱅온 전이 감지 폴러 — offline→online 전이만 이벤트를 발사해요. */
export class ChzzkPoller extends SubscriptionPoller {
	private readonly fetchFn: FetchFn;
	private readonly dispatcher: { dispatch(event: SocialEvent): Promise<void> };
	private subscriptionsCache: { channels: PolledChzzkChannel[]; cachedAt: number } | null = null;

	public constructor(options: {
		redis: NotifierRedis;
		getDb: () => PrismaClient | null;
		dispatcher: { dispatch(event: SocialEvent): Promise<void> };
		fetchFn?: FetchFn;
		now?: () => number;
	}) {
		super(options, {
			name: 'chzzkPoller',
			intervalMs: TICK_MS,
			lockKey: LOCK_KEY,
			lockTtlSeconds: LOCK_TTL_SECONDS,
			logger,
			startMessage: '치지직 폴러를 시작해요.',
			breakerOpenMessage: `치지직 폴링이 ${BREAKER_THRESHOLD}틱 연속 실패 — 30분간 봉쇄해요.`
		});
		this.fetchFn = options.fetchFn ?? fetch;
		this.dispatcher = options.dispatcher;
	}

	protected override async pollOnce(db: PrismaClient, now: number): Promise<PollOutcome> {
		const channels = await this.getChannels(db, now);
		if (channels.length === 0) return 'skipped';

		let tickFailed = false;
		for (const channel of channels) {
			const channelId = channel.sourcePlatformId;
			const state = await this.loadState(channelId);
			const interval = state?.isLive ? INTERVAL_ONLINE_MS : INTERVAL_OFFLINE_MS;
			if (state && now - state.lastPolledAt < interval) continue;
			try {
				const status = await fetchChzzkLiveStatus(channelId, this.fetchFn);
				await this.handleTransition(channel, state, status);
			} catch (error) {
				if (error instanceof ChzzkApiError && error.status === 404) {
					// 채널 단위 문제(삭제된 채널) — 시스템 장애가 아니라 브레이커에 넣지 않아요.
					logger.warn(`치지직 채널 ${channelId}을(를) 찾을 수 없어요 — 삭제된 채널이에요. 구독을 정리해 주세요.`);
					continue;
				}
				tickFailed = true;
				logger.warn(`치지직 채널 ${channelId} 폴링 실패:`, String(error));
			}
		}

		return tickFailed ? 'failed' : 'ok';
	}

	private async getChannels(db: PrismaClient, now: number): Promise<PolledChzzkChannel[]> {
		if (this.subscriptionsCache && now - this.subscriptionsCache.cachedAt < SUBSCRIPTION_CACHE_MS) {
			return this.subscriptionsCache.channels;
		}
		const rows = await db.socialSubscription
			.findMany({ where: { platform: 'chzzk', status: 'active' }, select: { sourcePlatformId: true, sourceName: true } })
			.catch(() => []);
		const unique = new Map<string, string | null>();
		for (const row of rows) unique.set(row.sourcePlatformId, row.sourceName);
		const channels = [...unique.entries()].map(([sourcePlatformId, sourceName]) => ({ sourcePlatformId, sourceName }));
		this.subscriptionsCache = { channels, cachedAt: now };
		return channels;
	}

	private async handleTransition(channel: PolledChzzkChannel, state: ChannelState | null, status: ChzzkLiveStatus): Promise<void> {
		const channelId = channel.sourcePlatformId;
		const now = this.now();
		if (!state) {
			// 첫 관찰 — 초기 동기화만 하고 알림은 안 보내요 (재시작 직후 온라인 채널 전체 폭발 방지)
			await this.saveState(channelId, { isLive: status.isLive, liveId: status.liveId, lastPolledAt: now });
			return;
		}
		if (status.isLive && !state.isLive) {
			// offline → online 전이 — 뱅온 이벤트!
			// live-status v2엔 channelName이 없는 경우가 있어요 — 구독 시점 이름으로 폴백 (실측 반영)
			const author = status.channelName ?? channel.sourceName ?? channelId;
			const publishedAt = this.now();
			const event: SocialEvent = {
				platform: 'chzzk',
				sourceId: channelId,
				contentId: status.liveId ?? `${channelId}-${publishedAt}`,
				title: status.liveTitle ?? `${author} 방송 시작!`,
				url: status.liveId ? `https://chzzk.naver.com/live/${status.liveId}` : `https://chzzk.naver.com/${channelId}`,
				// live-status는 liveImageUrl을 제공하지 않아서(2026-10 실측), 뱅온 확정 시점에 live-detail로 섬네일을 보완해요.
				thumbnail: status.thumbnailUrl ?? (await fetchChzzkLiveThumbnail(channelId, this.fetchFn)),
				author,
				publishedAt
			};
			logger.info(`치지직 뱅온 감지: ${author} (${channelId})`);
			await this.dispatcher.dispatch(event);
		}
		await this.saveState(channelId, { isLive: status.isLive, liveId: status.liveId, lastPolledAt: now });
	}

	private async loadState(channelId: string): Promise<ChannelState | null> {
		const raw = await this.options.redis.get(`${STATE_KEY_PREFIX}${channelId}`);
		if (!raw) return null;
		try {
			const parsed = JSON.parse(raw) as ChannelState;
			if (typeof parsed.isLive !== 'boolean' || typeof parsed.lastPolledAt !== 'number') return null;
			return parsed;
		} catch {
			return null;
		}
	}

	private async saveState(channelId: string, state: ChannelState): Promise<void> {
		await this.options.redis.set(`${STATE_KEY_PREFIX}${channelId}`, JSON.stringify(state), STATE_TTL_SECONDS);
	}
}
