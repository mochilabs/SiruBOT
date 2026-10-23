import type { PrismaClient } from '@sirubot/prisma';
import { getLogger } from '../utils/logger.ts';
import type { NotifierRedis } from './redis.ts';

const logger = getLogger('pollingLoop');

// plan §8: 폴링 실패 5회 연속 → 30분 봉쇄 (half-open: 이후 틱에서 자동 재시도)
export const BREAKER_THRESHOLD = 5;
export const BREAKER_COOLDOWN_MS = 30 * 60 * 1000;

/** notifier 앱 공용 로거 타입: 각 스케줄러가 자기 모듈 로거를 넘겨 채널을 유지해요. */
export type NotifierLogger = ReturnType<typeof getLogger>;

/** 한 틱의 결과: 'skipped'는 브레이커 실패 계정에서 제외돼요 (락 미획득·구독 없음 등 조기 종료). */
export type PollOutcome = 'ok' | 'failed' | 'skipped';

/** tick 예외 처리 정책: 'continue'는 로그를 남기고 다음 틱을 예약하고, 'abort'는 루프를 멈춰요. */
export type PollingErrorPolicy = 'continue' | 'abort';

export interface PollingLoopOptions {
	/** 진단용 루프 이름: tick 예외 로그에 남겨요. */
	name: string;
	/** 틱 간격 (ms). */
	intervalMs: number;
	/** start() 직후 즉시 첫 틱을 돌릴지 여부. 기본은 true예요. */
	runImmediately?: boolean;
	/** tick에서 던져진 예외의 처리 정책. 기본은 'continue'예요. */
	errorPolicy?: PollingErrorPolicy;
	/** tick 예외 로깅 훅: 정책을 적용하기 전에 불려요. 미지정이면 모듈 로거로 남겨요. */
	onError?: (error: unknown) => void;
	/** 틱 본문. */
	tick: () => Promise<void>;
}

/** interval 폴링 루프의 공용 골격 (plan §2.5): 스케줄링·타이머 정리·재입장 방지를 담당해요. */
export class PollingLoop {
	private readonly options: PollingLoopOptions;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private ticking = false;
	private stopped = true;
	/** start/stop마다 증가: 이전 세대가 남긴 타이머 연쇄가 되살아나지 않게 해요. */
	private generation = 0;

	public constructor(options: PollingLoopOptions) {
		this.options = options;
	}

	/** 루프가 켜져 있는지: 중복 start()에서 시작 로그를 다시 남기지 않는 데 써요. */
	public get isRunning(): boolean {
		return !this.stopped;
	}

	public start(): void {
		if (!this.stopped) return;
		this.stopped = false;
		const generation = ++this.generation;
		if (this.options.runImmediately ?? true) void this.runTick(generation);
		else this.scheduleNext(generation);
	}

	public stop(): void {
		this.stopped = true;
		this.generation++;
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
	}

	private scheduleNext(generation: number): void {
		if (this.stopped || generation !== this.generation) return;
		this.timer = setTimeout(() => void this.runTick(generation), this.options.intervalMs);
	}

	private async runTick(generation: number): Promise<void> {
		if (this.stopped || generation !== this.generation) return;
		try {
			// 틱 몸통이 진행 중이면 재입장하지 않고 다음 틱 예약만 해요.
			if (!this.ticking) {
				this.ticking = true;
				try {
					await this.options.tick();
				} catch (error) {
					this.reportError(error);
					if (this.options.errorPolicy === 'abort') {
						this.stopped = true;
						return;
					}
				} finally {
					this.ticking = false;
				}
			}
		} finally {
			// 몸통이 던져도 다음 틱은 계속 예약해요 (errorPolicy 'continue').
			if (!this.stopped && generation === this.generation) this.scheduleNext(generation);
		}
	}

	private reportError(error: unknown): void {
		if (this.options.onError) {
			this.options.onError(error);
			return;
		}
		logger.error(`${this.options.name} 틱 실패:`, String(error));
	}
}

export interface SubscriptionPollerOptions {
	redis: NotifierRedis;
	getDb: () => PrismaClient | null;
	/** 테스트용 시계 주입. */
	now?: () => number;
}

export interface SubscriptionPollerConfig {
	/** PollingLoop 진단 이름. */
	name: string;
	/** 틱 간격 (ms). */
	intervalMs: number;
	/** 분산 락 키: 폴러 다중 인스턴스 방지. */
	lockKey: string;
	/** 락 TTL(초): 틱 간격보다 짧게. */
	lockTtlSeconds: number;
	/** start·브레이커 안내를 남길 로거. */
	logger: NotifierLogger;
	/** start() 때 남기는 문구. */
	startMessage: string;
	/** 서킷 브레이커가 열릴 때 남기는 문구. */
	breakerOpenMessage: string;
}

/**
 * "구독 목록 조회 → 플랫폼별 상태 확인 → 이벤트 발행" 폴링 스케줄러의 공통 골격 (plan §2.5).
 * 서킷 브레이커·분산 락·DB 가드·틱 실패 계정을 소유하고, 도메인 작업은 pollOnce 훅으로 남겨요.
 */
export abstract class SubscriptionPoller {
	private readonly loop: PollingLoop;
	private readonly config: SubscriptionPollerConfig;
	private consecutiveFailures = 0;
	private breakerOpenUntil = 0;
	protected readonly now: () => number;

	protected constructor(
		protected readonly options: SubscriptionPollerOptions,
		config: SubscriptionPollerConfig
	) {
		this.config = config;
		this.now = options.now ?? Date.now;
		this.loop = new PollingLoop({ name: config.name, intervalMs: config.intervalMs, tick: () => this.pollTick() });
	}

	public start(): void {
		if (this.loop.isRunning) return;
		this.config.logger.info(this.config.startMessage);
		this.loop.start();
	}

	public stop(): void {
		this.loop.stop();
	}

	/** 한 틱: 브레이커·락·DB 가드를 통과한 뒤 도메인 pollOnce를 부르고 실패 계정을 갱신해요. */
	private async pollTick(): Promise<void> {
		const now = this.now();
		// 서킷 브레이커: 봉쇄 중이면 생략 (쿨다운 종료 후 half-open으로 자동 재시도)
		if (now < this.breakerOpenUntil) return;
		if (!(await this.options.redis.acquireLock(this.config.lockKey, this.config.lockTtlSeconds))) return;
		const db = this.options.getDb();
		if (!db) return;

		const outcome = await this.pollOnce(db, now);
		// 'skipped'는 계정에서 제외: 실패 연속 카운트에 영향을 주지 않아요.
		if (outcome === 'skipped') return;
		if (outcome === 'failed') {
			this.consecutiveFailures++;
			if (this.consecutiveFailures >= BREAKER_THRESHOLD) {
				this.breakerOpenUntil = this.now() + BREAKER_COOLDOWN_MS;
				this.consecutiveFailures = 0;
				this.config.logger.error(this.config.breakerOpenMessage);
			}
		} else {
			this.consecutiveFailures = 0;
		}
	}

	/** 한 틱의 도메인 작업: 구독 조회·상태 확인·이벤트 발행. 반환값으로 브레이커 계정을 갱신해요. */
	protected abstract pollOnce(db: PrismaClient, now: number): Promise<PollOutcome>;
}
