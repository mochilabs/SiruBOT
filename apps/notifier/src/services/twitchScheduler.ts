import type { PrismaClient } from '@sirubot/prisma';
import { BREAKER_THRESHOLD, SubscriptionPoller, type PollOutcome } from './pollingLoop.ts';
import type { NotifierRedis } from './redis.ts';
import type { TwitchApiClient } from './twitchApi.ts';
import { getLogger } from '../utils/logger.ts';

const logger = getLogger('twitchScheduler');

const TICK_MS = 60 * 60 * 1000; // 1시간 — 구독 수명이 약 10일이라 여유 있게 점검해요.
const LOCK_KEY = 'sirubot:social:twitch:scheduler-lock';
const LOCK_TTL_SECONDS = 3_000; // 틱(1h)보다 살짝 짧게 — 매 틱이 락을 다시 얻어요.
const STATE_KEY_PREFIX = 'sirubot:social:twitch:sub:';
const STATE_TTL_SECONDS = 12 * 24 * 60 * 60;
// 구독 수명 약 10일 — 8일이 지나면 새 구독을 만들어 교체해요 (구형은 만료되면 저절로 사라져요).
const RENEWAL_AGE_MS = 8 * 24 * 60 * 60 * 1000;

interface SubscriptionState {
	subscriptionId: string;
	createdAt: number;
}

/** 트위치 EventSub 구독 갱신 워커 — stream.online 구독이 약 10일마다 만료되므로 8일 시점에 새로 등록해요. */
export class TwitchScheduler extends SubscriptionPoller {
	private readonly client: TwitchApiClient;
	private readonly callbackUrl: string;
	private readonly eventSubSecret: string;

	public constructor(options: {
		redis: NotifierRedis;
		getDb: () => PrismaClient | null;
		client: TwitchApiClient;
		callbackUrl: string;
		eventSubSecret: string;
		now?: () => number;
	}) {
		super(options, {
			name: 'twitchScheduler',
			intervalMs: TICK_MS,
			lockKey: LOCK_KEY,
			lockTtlSeconds: LOCK_TTL_SECONDS,
			logger,
			startMessage: '트위치 스케줄러를 시작해요.',
			breakerOpenMessage: `트위치 구독 동기화가 ${BREAKER_THRESHOLD}틱 연속 실패 — 30분간 봉쇄해요.`
		});
		this.client = options.client;
		this.callbackUrl = options.callbackUrl;
		this.eventSubSecret = options.eventSubSecret;
	}

	protected override async pollOnce(db: PrismaClient, now: number): Promise<PollOutcome> {
		const rows = await db.socialSubscription
			.findMany({ where: { platform: 'twitch', status: 'active' }, select: { sourcePlatformId: true } })
			.catch(() => []);
		const broadcasterIds = [...new Set(rows.map((row) => row.sourcePlatformId))];
		if (broadcasterIds.length === 0) return 'skipped';

		let tickFailed = false;
		for (const broadcasterId of broadcasterIds) {
			const state = await this.loadState(broadcasterId);
			if (state && now - state.createdAt < RENEWAL_AGE_MS) continue;
			try {
				const created = await this.client.createStreamOnlineSubscription({
					broadcasterUserId: broadcasterId,
					callbackUrl: this.callbackUrl,
					secret: this.eventSubSecret
				});
				if (!created) throw new Error('응답에 구독 ID가 없어요.');
				await this.saveState(broadcasterId, { subscriptionId: created.subscriptionId, createdAt: now });
				logger.info(`트위치 구독 등록/갱신: ${broadcasterId} → ${created.subscriptionId}`);
			} catch (error) {
				tickFailed = true;
				logger.warn(`트위치 ${broadcasterId} 구독 생성 실패:`, String(error));
			}
		}

		return tickFailed ? 'failed' : 'ok';
	}

	private async loadState(broadcasterId: string): Promise<SubscriptionState | null> {
		const raw = await this.options.redis.get(`${STATE_KEY_PREFIX}${broadcasterId}`);
		if (!raw) return null;
		try {
			const parsed = JSON.parse(raw) as SubscriptionState;
			if (typeof parsed.subscriptionId !== 'string' || typeof parsed.createdAt !== 'number') return null;
			return parsed;
		} catch {
			return null;
		}
	}

	private async saveState(broadcasterId: string, state: SubscriptionState): Promise<void> {
		await this.options.redis.set(`${STATE_KEY_PREFIX}${broadcasterId}`, JSON.stringify(state), STATE_TTL_SECONDS);
	}
}
