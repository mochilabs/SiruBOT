import type { PrismaClient } from '@sirubot/prisma';
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
// 서킷 브레이커 — 틱 실패 5회 연속 → 30분 봉쇄 (chzzkPoller·youtubeScheduler와 같은 규칙)
const BREAKER_THRESHOLD = 5;
const BREAKER_COOLDOWN_MS = 30 * 60 * 1000;

interface SubscriptionState {
	subscriptionId: string;
	createdAt: number;
}

/** 트위치 EventSub 구독 갱신 워커 — stream.online 구독이 약 10일마다 만료되므로 8일 시점에 새로 등록해요. */
export class TwitchScheduler {
	private readonly now: () => number;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private running = false;
	private stopped = true;
	private consecutiveFailures = 0;
	private breakerOpenUntil = 0;

	public constructor(
		private readonly options: {
			redis: NotifierRedis;
			getDb: () => PrismaClient | null;
			client: TwitchApiClient;
			callbackUrl: string;
			eventSubSecret: string;
			now?: () => number;
		}
	) {
		this.now = options.now ?? Date.now;
	}

	public start(): void {
		if (!this.stopped) return;
		this.stopped = false;
		logger.info('트위치 스케줄러를 시작해요.');
		void this.tick();
	}

	public stop(): void {
		this.stopped = true;
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
	}

	private scheduleNext(): void {
		if (this.stopped) return;
		this.timer = setTimeout(() => void this.tick(), TICK_MS);
	}

	private async tick(): Promise<void> {
		if (this.stopped) return;
		try {
			if (!this.running) {
				this.running = true;
				try {
					await this.syncOnce();
				} finally {
					this.running = false;
				}
			}
		} finally {
			this.scheduleNext();
		}
	}

	private async syncOnce(): Promise<void> {
		const now = this.now();
		// 서킷 브레이커 — 봉쇄 중이면 생략 (쿨다운 종료 후 half-open 재시도)
		if (now < this.breakerOpenUntil) return;
		if (!(await this.options.redis.acquireLock(LOCK_KEY, LOCK_TTL_SECONDS))) return;
		const db = this.options.getDb();
		if (!db) return;

		const rows = await db.socialSubscription
			.findMany({ where: { platform: 'twitch', status: 'active' }, select: { sourcePlatformId: true } })
			.catch(() => []);
		const broadcasterIds = [...new Set(rows.map((row) => row.sourcePlatformId))];
		if (broadcasterIds.length === 0) return;

		let tickFailed = false;
		for (const broadcasterId of broadcasterIds) {
			const state = await this.loadState(broadcasterId);
			if (state && now - state.createdAt < RENEWAL_AGE_MS) continue;
			try {
				const created = await this.options.client.createStreamOnlineSubscription({
					broadcasterUserId: broadcasterId,
					callbackUrl: this.options.callbackUrl,
					secret: this.options.eventSubSecret
				});
				if (!created) throw new Error('응답에 구독 ID가 없어요.');
				await this.saveState(broadcasterId, { subscriptionId: created.subscriptionId, createdAt: now });
				logger.info(`트위치 구독 등록/갱신: ${broadcasterId} → ${created.subscriptionId}`);
			} catch (error) {
				tickFailed = true;
				logger.warn(`트위치 ${broadcasterId} 구독 생성 실패:`, String(error));
			}
		}

		if (tickFailed) {
			this.consecutiveFailures++;
			if (this.consecutiveFailures >= BREAKER_THRESHOLD) {
				this.breakerOpenUntil = this.now() + BREAKER_COOLDOWN_MS;
				this.consecutiveFailures = 0;
				logger.error(`트위치 구독 동기화가 ${BREAKER_THRESHOLD}틱 연속 실패 — 30분간 봉쇄해요.`);
			}
		} else {
			this.consecutiveFailures = 0;
		}
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
