import type { Prisma, PrismaClient, ScheduledJob } from '@sirubot/prisma';
import type { AppLogger } from '../lib/appLogger.ts';
import type { Stoppable } from '../lib/lifecycle.ts';

export type { ScheduledJob };

export const JOB_TICK_INTERVAL_MS = 15_000;
export const JOB_CLAIM_LIMIT = 50;
export const JOB_MAX_ATTEMPTS = 3;
export const JOB_BACKOFF_MS = [30_000, 120_000, 600_000] as const;
export const JOB_STALE_AFTER_MS = 5 * 60_000;
export const JOB_STOP_TIMEOUT_MS = 4_000;
const LAST_ERROR_MAX = 500;

export type JobHandler = (job: ScheduledJob) => Promise<void>;

export interface NewScheduledJob {
	guildId: string;
	kind: string;
	runAt: Date;
	payload?: Prisma.InputJsonValue;
	createdBy: string;
}

export interface GuildJobSchedulerDeps {
	db: Pick<PrismaClient, 'scheduledJob' | '$queryRaw'>;
	getOwnedGuildIds: () => readonly string[];
	logger: AppLogger;
	now?: () => Date;
	processId: string;
	intervalMs?: number;
	staleAfterMs?: number;
	stopTimeoutMs?: number;
	runInGuild?: <T>(guildId: string, fn: () => Promise<T> | T) => Promise<T>;
}

const errorMessage = (error: unknown): string => {
	const text = error instanceof Error ? error.message : String(error);
	return text.slice(0, LAST_ERROR_MAX);
};

export class GuildJobScheduler implements Stoppable {
	public readonly name = '길드 예약 작업';

	private readonly handlers = new Map<string, JobHandler>();
	private readonly inFlight = new Set<Promise<void>>();
	private readonly runningIds = new Set<string>();
	private claiming: Promise<unknown> | null = null;
	private timer: ReturnType<typeof setInterval> | null = null;
	private stopped = false;

	public constructor(private readonly deps: GuildJobSchedulerDeps) {}

	private now(): Date {
		return this.deps.now?.() ?? new Date();
	}

	public register(kind: string, handler: JobHandler): void {
		if (this.handlers.has(kind)) throw new Error(`이미 등록된 예약 작업 종류예요: ${kind}`);
		this.handlers.set(kind, handler);
	}

	public start(): void {
		if (this.stopped || this.timer) return;
		this.timer = setInterval(() => void this.tick(), this.deps.intervalMs ?? JOB_TICK_INTERVAL_MS);
		this.timer.unref?.();
	}

	public schedule(job: NewScheduledJob): Promise<ScheduledJob> {
		return this.deps.db.scheduledJob.create({
			data: { guildId: job.guildId, kind: job.kind, runAt: job.runAt, payload: job.payload ?? {}, createdBy: job.createdBy }
		});
	}

	public async cancel(id: string): Promise<boolean> {
		const { count } = await this.deps.db.scheduledJob.deleteMany({ where: { id, status: 'pending' } });
		return count > 0;
	}

	public async tick(): Promise<void> {
		if (this.stopped || this.claiming) return;
		const claim = this.recoverAndClaim();
		this.claiming = claim;
		let jobs: ScheduledJob[] = [];
		try {
			jobs = await claim;
		} catch (error) {
			this.deps.logger.error(`예약 작업 가져오기에 실패했어요: ${errorMessage(error)}`);
		} finally {
			this.claiming = null;
		}
		await Promise.all(jobs.map((job) => this.track(this.run(job))));
	}

	public async stop(): Promise<void> {
		this.stopped = true;
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
		const timeoutMs = this.deps.stopTimeoutMs ?? JOB_STOP_TIMEOUT_MS;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timedOut = new Promise<'timeout'>((resolve) => {
			timer = setTimeout(() => resolve('timeout'), timeoutMs);
		});
		const drained = (async () => {
			await this.claiming?.catch(() => undefined);
			await Promise.all([...this.inFlight]);
			return 'done' as const;
		})();
		const result = await Promise.race([drained, timedOut]);
		clearTimeout(timer);
		if (result === 'timeout') {
			this.deps.logger.warn(`예약 작업 ${this.inFlight.size}개가 ${timeoutMs}ms 안에 끝나지 않았어요. 5분 뒤 대기열로 돌아가요`);
		}
	}

	private track(promise: Promise<void>): Promise<void> {
		const tracked = promise.finally(() => this.inFlight.delete(tracked));
		this.inFlight.add(tracked);
		return tracked;
	}

	private async recoverAndClaim(): Promise<ScheduledJob[]> {
		const guilds = [...this.deps.getOwnedGuildIds()];
		if (guilds.length === 0) return [];
		await this.recoverStale(guilds);
		if (this.stopped) return [];
		return this.claim(guilds);
	}

	private async recoverStale(guilds: string[]): Promise<void> {
		const cutoff = new Date(this.now().getTime() - (this.deps.staleAfterMs ?? JOB_STALE_AFTER_MS));
		const running = [...this.runningIds];
		const { count } = await this.deps.db.scheduledJob.updateMany({
			where: {
				status: 'running',
				lockedAt: { lt: cutoff },
				guildId: { in: guilds },
				...(running.length > 0 ? { id: { notIn: running } } : {})
			},
			data: { status: 'pending', lockedBy: null, lockedAt: null }
		});
		if (count > 0) this.deps.logger.warn(`멈춰 있던 예약 작업 ${count}개를 대기열로 되돌렸어요`);
	}

	private claim(guilds: string[]): Promise<ScheduledJob[]> {
		const { processId } = this.deps;
		// runAt·lockedAt은 timestamp(UTC)라 DB 시계도 UTC로 맞춰서 비교해요 (세션 시간대와 무관)
		return this.deps.db.$queryRaw<ScheduledJob[]>`
			UPDATE "ScheduledJob"
			SET "status" = 'running', "lockedBy" = ${processId}, "lockedAt" = timezone('UTC', now()), "updatedAt" = timezone('UTC', now())
			WHERE "id" IN (
				SELECT "id" FROM "ScheduledJob"
				WHERE "status" = 'pending' AND "runAt" <= timezone('UTC', now()) AND "guildId" = ANY(${guilds}::text[])
				ORDER BY "runAt"
				FOR UPDATE SKIP LOCKED
				LIMIT ${JOB_CLAIM_LIMIT}
			)
			RETURNING *`;
	}

	private async run(job: ScheduledJob): Promise<void> {
		this.runningIds.add(job.id);
		try {
			const handler = this.handlers.get(job.kind);
			if (!handler) {
				this.deps.logger.error(`등록되지 않은 예약 작업 종류예요: ${job.kind} (job ${job.id})`);
				await this.finish(job, { status: 'failed', attempts: job.attempts + 1, lastError: `unknown kind: ${job.kind}` });
				return;
			}
			try {
				const runInGuild = this.deps.runInGuild;
				await (runInGuild ? runInGuild(job.guildId, () => handler(job)) : handler(job));
			} catch (error) {
				await this.fail(job, error);
				return;
			}
			await this.finish(job, { status: 'done' });
		} catch (error) {
			this.deps.logger.error(`예약 작업 결과를 기록하지 못했어요 (job ${job.id}): ${errorMessage(error)}`);
		} finally {
			this.runningIds.delete(job.id);
		}
	}

	private async fail(job: ScheduledJob, error: unknown): Promise<void> {
		const attempts = job.attempts + 1;
		const lastError = errorMessage(error);
		if (attempts >= JOB_MAX_ATTEMPTS) {
			this.deps.logger.warn(`예약 작업이 ${attempts}번 실패해서 멈췄어요: ${job.kind} (job ${job.id}, guild ${job.guildId}): ${lastError}`);
			await this.finish(job, { status: 'failed', attempts, lastError });
			return;
		}
		const delay = JOB_BACKOFF_MS[attempts - 1] ?? JOB_BACKOFF_MS[JOB_BACKOFF_MS.length - 1];
		this.deps.logger.info(`예약 작업이 실패해서 ${delay / 1000}초 뒤 다시 해요: ${job.kind} (job ${job.id}): ${lastError}`);
		await this.finish(job, {
			status: 'pending',
			attempts,
			lastError,
			runAt: new Date(this.now().getTime() + delay)
		});
	}

	private async finish(job: ScheduledJob, data: Prisma.ScheduledJobUpdateManyMutationInput): Promise<void> {
		await this.deps.db.scheduledJob.updateMany({
			where: { id: job.id, status: 'running', lockedBy: this.deps.processId },
			data: { ...data, lockedBy: null, lockedAt: null }
		});
	}
}
