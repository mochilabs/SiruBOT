import type { PrismaClient } from '@sirubot/prisma';
import type { SocialEvent } from '@sirubot/utils';
import { BREAKER_THRESHOLD, SubscriptionPoller, type PollOutcome } from './pollingLoop.ts';
import {
	fetchYouTubeUploadsFeed,
	parseYouTubeAtomFeed,
	subscribeYouTubeChannel,
	YOUTUBE_LEASE_SECONDS,
	type YouTubeFetchFn
} from './youtubeWebSub.ts';
import type { NotifierRedis } from './redis.ts';
import { getLogger } from '../utils/logger.ts';

const logger = getLogger('youtubeScheduler');

const TICK_MS = 5 * 60 * 1000;
const LOCK_KEY = 'sirubot:social:youtube:scheduler-lock';
const LOCK_TTL_SECONDS = 270;
const LEASE_KEY_PREFIX = 'sirubot:social:youtube:lease:';
const RENEW_THRESHOLD_MS = 24 * 60 * 60 * 1000;
const LEASE_TTL_SECONDS = YOUTUBE_LEASE_SECONDS + 60;
const AUDIT_KEY_PREFIX = 'sirubot:social:youtube:audit:';
const AUDIT_INTERVAL_BASE_SECONDS = 30 * 60;
const AUDIT_JITTER_SECONDS = 30 * 60;

interface LeaseState {
	leaseUntil: number;
}

export class YouTubeScheduler extends SubscriptionPoller {
	private readonly fetchFn: YouTubeFetchFn;
	private readonly dispatcher: { dispatch(event: SocialEvent): Promise<void> };
	private readonly callbackUrl: string | null;
	private readonly hubSecret: string | null;

	public constructor(options: {
		redis: NotifierRedis;
		getDb: () => PrismaClient | null;
		dispatcher: { dispatch(event: SocialEvent): Promise<void> };
		callbackUrl: string | null;
		hubSecret: string | null;
		fetchFn?: YouTubeFetchFn;
		now?: () => number;
	}) {
		super(options, {
			name: 'youtubeScheduler',
			intervalMs: TICK_MS,
			lockKey: LOCK_KEY,
			lockTtlSeconds: LOCK_TTL_SECONDS,
			logger,
			startMessage: '유튜브 스케줄러를 시작해요.',
			breakerOpenMessage: `유튜브 스케줄러가 ${BREAKER_THRESHOLD}틱 연속 실패: 30분간 봉쇄해요.`
		});
		this.fetchFn = options.fetchFn ?? fetch;
		this.dispatcher = options.dispatcher;
		this.callbackUrl = options.callbackUrl;
		this.hubSecret = options.hubSecret;
	}

	protected override async pollOnce(db: PrismaClient, now: number): Promise<PollOutcome> {
		let rows: { sourcePlatformId: string }[];
		try {
			rows = await db.socialSubscription.findMany({ where: { platform: 'youtube', status: 'active' }, select: { sourcePlatformId: true } });
		} catch (error) {
			logger.error('유튜브 구독 목록 조회 실패: 이번 틱은 실패로 기록해요:', String(error));
			return 'failed';
		}
		const channelIds = [...new Set(rows.map((row) => row.sourcePlatformId))];
		if (channelIds.length === 0) return 'skipped';

		let tickFailed = false;

		if (this.callbackUrl && this.hubSecret) {
			for (const channelId of channelIds) {
				const lease = await this.loadLease(channelId);
				if (lease && lease.leaseUntil - now > RENEW_THRESHOLD_MS) continue;
				const ok = await subscribeYouTubeChannel({
					channelId,
					callbackUrl: this.callbackUrl,
					secret: this.hubSecret,
					fetchFn: this.fetchFn
				});
				if (ok) {
					await this.options.redis.set(
						`${LEASE_KEY_PREFIX}${channelId}`,
						JSON.stringify({ leaseUntil: now + YOUTUBE_LEASE_SECONDS * 1000 }),
						LEASE_TTL_SECONDS
					);
				} else {
					tickFailed = true;
				}
			}
		}

		// WebSub 재전송이 없어 놓친 영상을 저빈도 RSS 폴링으로 회수해요.
		for (const channelId of channelIds) {
			const auditKey = `${AUDIT_KEY_PREFIX}${channelId}`;
			if (await this.options.redis.get(auditKey)) continue;
			try {
				const xml = await fetchYouTubeUploadsFeed(channelId, this.fetchFn);
				const { events } = parseYouTubeAtomFeed(xml);
				for (const event of events) {
					await this.dispatcher.dispatch(event).catch(() => undefined);
				}
				const ttl = AUDIT_INTERVAL_BASE_SECONDS + Math.floor(Math.random() * AUDIT_JITTER_SECONDS);
				await this.options.redis.set(auditKey, '1', ttl);
			} catch (error) {
				tickFailed = true;
				logger.warn(`유튜브 채널 ${channelId} 감사 폴링 실패:`, String(error));
			}
		}

		return tickFailed ? 'failed' : 'ok';
	}

	private async loadLease(channelId: string): Promise<LeaseState | null> {
		const raw = await this.options.redis.get(`${LEASE_KEY_PREFIX}${channelId}`);
		if (!raw) return null;
		try {
			const parsed = JSON.parse(raw) as LeaseState;
			return typeof parsed.leaseUntil === 'number' ? parsed : null;
		} catch {
			return null;
		}
	}
}
