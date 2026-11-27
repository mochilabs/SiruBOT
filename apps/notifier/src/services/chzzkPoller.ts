import type { PrismaClient } from '@sirubot/prisma';
import type { SocialEvent } from '@sirubot/utils';
import { ChzzkApiError, fetchChzzkLiveStatus, fetchChzzkLiveThumbnail, type ChzzkLiveStatus, type FetchFn } from './chzzkApi.ts';
import { BREAKER_THRESHOLD, SubscriptionPoller, type PollOutcome } from './pollingLoop.ts';
import type { NotifierRedis } from './redis.ts';
import { getLogger } from '../utils/logger.ts';

const logger = getLogger('chzzkPoller');

const TICK_MS = 30_000;
const LOCK_KEY = 'sirubot:social:chzzk:poll-lock';
const LOCK_TTL_SECONDS = 25;
const STATE_KEY_PREFIX = 'sirubot:social:chzzk:live:';
const STATE_TTL_SECONDS = 7 * 24 * 60 * 60;
const INTERVAL_ONLINE_MS = 2 * 60 * 1000;
const INTERVAL_OFFLINE_MS = 5 * 60 * 1000;
const SUBSCRIPTION_CACHE_MS = 60_000;

interface ChannelState {
	isLive: boolean;
	liveId: string | null;
	lastPolledAt: number;
}

interface PolledChzzkChannel {
	sourcePlatformId: string;
	sourceName: string | null;
}

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
			breakerOpenMessage: `치지직 폴링이 ${BREAKER_THRESHOLD}틱 연속 실패: 30분간 봉쇄해요.`
		});
		this.fetchFn = options.fetchFn ?? fetch;
		this.dispatcher = options.dispatcher;
	}

	protected override async pollOnce(db: PrismaClient, now: number): Promise<PollOutcome> {
		const channels = await this.getChannels(db, now);
		// DB 오류를 빈 목록으로 삼키지 않아야 서킷 브레이커가 동작해요.
		if (!channels) return 'failed';
		if (channels.length === 0) return 'skipped';

		let tickFailed = false;
		for (const channel of channels) {
			const channelId = channel.sourcePlatformId;
			const state = await this.readJsonState<ChannelState>(
				`${STATE_KEY_PREFIX}${channelId}`,
				(s) => typeof s.isLive === 'boolean' && typeof s.lastPolledAt === 'number'
			);
			const interval = state?.isLive ? INTERVAL_ONLINE_MS : INTERVAL_OFFLINE_MS;
			if (state && now - state.lastPolledAt < interval) continue;
			try {
				const status = await fetchChzzkLiveStatus(channelId, this.fetchFn);
				await this.handleTransition(channel, state, status);
			} catch (error) {
				if (error instanceof ChzzkApiError && error.status === 404) {
					logger.warn(`치지직 채널 ${channelId}을(를) 찾을 수 없어요. 삭제된 채널이에요. 구독을 정리해 주세요.`);
					continue;
				}
				tickFailed = true;
				logger.warn(`치지직 채널 ${channelId} 폴링 실패:`, String(error));
			}
		}

		return tickFailed ? 'failed' : 'ok';
	}

	private async getChannels(db: PrismaClient, now: number): Promise<PolledChzzkChannel[] | null> {
		if (this.subscriptionsCache && now - this.subscriptionsCache.cachedAt < SUBSCRIPTION_CACHE_MS) {
			return this.subscriptionsCache.channels;
		}
		try {
			const rows = await db.socialSubscription.findMany({
				where: { platform: 'chzzk', status: 'active' },
				select: { sourcePlatformId: true, sourceName: true }
			});
			const unique = new Map<string, string | null>();
			for (const row of rows) unique.set(row.sourcePlatformId, row.sourceName);
			const channels = [...unique.entries()].map(([sourcePlatformId, sourceName]) => ({ sourcePlatformId, sourceName }));
			this.subscriptionsCache = { channels, cachedAt: now };
			return channels;
		} catch (error) {
			logger.error('치지직 구독 목록 조회 실패: 이번 틱은 실패로 기록해요:', String(error));
			return null;
		}
	}

	private async handleTransition(channel: PolledChzzkChannel, state: ChannelState | null, status: ChzzkLiveStatus): Promise<void> {
		const channelId = channel.sourcePlatformId;
		const now = this.now();
		if (!state) {
			// 첫 관찰은 상태만 동기화해 재시작 직후 알림 폭발을 막아요.
			await this.saveState(channelId, { isLive: status.isLive, liveId: status.liveId, lastPolledAt: now });
			return;
		}
		if (status.isLive && !state.isLive) {
			const author = status.channelName ?? channel.sourceName ?? channelId;
			const publishedAt = this.now();
			const event: SocialEvent = {
				platform: 'chzzk',
				sourceId: channelId,
				contentId: status.liveId ?? `${channelId}-${publishedAt}`,
				title: status.liveTitle ?? `${author} 방송 시작!`,
				url: status.liveId ? `https://chzzk.naver.com/live/${status.liveId}` : `https://chzzk.naver.com/${channelId}`,
				thumbnail: status.thumbnailUrl ?? (await fetchChzzkLiveThumbnail(channelId, this.fetchFn)),
				author,
				publishedAt
			};
			logger.info(`치지직 뱅온 감지: ${author} (${channelId})`);
			await this.dispatcher.dispatch(event);
		}
		await this.saveState(channelId, { isLive: status.isLive, liveId: status.liveId, lastPolledAt: now });
	}

	private async saveState(channelId: string, state: ChannelState): Promise<void> {
		await this.options.redis.set(`${STATE_KEY_PREFIX}${channelId}`, JSON.stringify(state), STATE_TTL_SECONDS);
	}
}
