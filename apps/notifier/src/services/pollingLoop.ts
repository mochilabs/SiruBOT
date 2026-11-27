import type { PrismaClient } from '@sirubot/prisma';
import { getLogger } from '../utils/logger.ts';
import type { NotifierRedis } from './redis.ts';

const logger = getLogger('pollingLoop');

export const BREAKER_THRESHOLD = 5;
export const BREAKER_COOLDOWN_MS = 30 * 60 * 1000;

export type NotifierLogger = ReturnType<typeof getLogger>;

export type PollOutcome = 'ok' | 'failed' | 'skipped';

export type PollingErrorPolicy = 'continue' | 'abort';

export interface PollingLoopOptions {
	name: string;
	intervalMs: number;
	runImmediately?: boolean;
	errorPolicy?: PollingErrorPolicy;
	onError?: (error: unknown) => void;
	tick: () => Promise<void>;
}

export class PollingLoop {
	private readonly options: PollingLoopOptions;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private ticking = false;
	private stopped = true;
	/** start/stop마다 증가해 이전 세대 타이머 연쇄를 무효화해요. */
	private generation = 0;

	public constructor(options: PollingLoopOptions) {
		this.options = options;
	}

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
	now?: () => number;
}

export interface SubscriptionPollerConfig {
	name: string;
	intervalMs: number;
	lockKey: string;
	lockTtlSeconds: number;
	logger: NotifierLogger;
	startMessage: string;
	breakerOpenMessage: string;
}

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

	private async pollTick(): Promise<void> {
		const now = this.now();
		if (now < this.breakerOpenUntil) return;
		if (!(await this.options.redis.acquireLock(this.config.lockKey, this.config.lockTtlSeconds))) return;
		const db = this.options.getDb();
		if (!db) return;

		const outcome = await this.pollOnce(db, now);
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

	protected abstract pollOnce(db: PrismaClient, now: number): Promise<PollOutcome>;
}
