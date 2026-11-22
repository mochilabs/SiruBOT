/**
 * 길드 예약 작업 스케줄러 — "정해진 시각에, 그 서버를 가진 봇이, 한 번만" 실행하는 공통 기반이에요.
 *
 * - 15초마다 이 프로세스가 가진 길드의 만기 작업(ScheduledJob)을 `FOR UPDATE SKIP LOCKED`로 원자적으로 가져가요.
 *   롤링 배포 중 두 프로세스가 같은 길드를 잠깐 가져도 한 작업은 한 번만 실행돼요.
 * - 종류(kind)별 핸들러는 각 기능이 `register(kind, handler)`로 등록해요. 모르는 kind는 failed로 닫고 로그를 남겨요.
 * - 실패하면 attempts+1, 30초·2분·10분 백오프로 runAt을 미뤄요. 3회째 실패하면 failed + warn 로그.
 * - running인 채로 5분이 넘은 작업(프로세스가 죽은 경우)은 같은 tick에서 pending으로 되돌려요.
 * - 반복 작업은 핸들러가 끝날 때 `nextRunAt()`(packages/utils/src/jobRecurrence.ts)로 다음 행을 `schedule()`해요.
 * - 시각 비교는 DB 시계(UTC)를 써서 프로세스 간 시계 차이에 흔들리지 않아요. 백오프·stale 기준은 주입한 `now()`예요.
 */
import type { Prisma, PrismaClient, ScheduledJob } from '@sirubot/prisma';
import type { AppLogger } from '../lib/appLogger.ts';
import type { Stoppable } from '../lib/lifecycle.ts';

export type { ScheduledJob };

export const JOB_TICK_INTERVAL_MS = 15_000;
export const JOB_CLAIM_LIMIT = 50;
export const JOB_MAX_ATTEMPTS = 3;
/** 실패 횟수별 재시도 지연(ms): 1번째 실패 30초, 2번째 2분 (3번째는 failed라 쓰지 않지만 10분을 남겨 둬요) */
export const JOB_BACKOFF_MS = [30_000, 120_000, 600_000] as const;
export const JOB_STALE_AFTER_MS = 5 * 60_000;
/** stop()이 진행 중인 핸들러를 기다리는 상한 — 종료 단계 전체 상한(STOPPABLES_TIMEOUT_MS 5초)보다 짧게 잡아요 */
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
	/** 이 프로세스(샤드)가 가진 길드 ID — 호출 시점에 읽어요 */
	getOwnedGuildIds: () => readonly string[];
	logger: AppLogger;
	now?: () => Date;
	/** 가져간 작업에 남기는 프로세스 ID (lockedBy) */
	processId: string;
	intervalMs?: number;
	staleAfterMs?: number;
	stopTimeoutMs?: number;
}

const errorMessage = (error: unknown): string => {
	const text = error instanceof Error ? error.message : String(error);
	return text.slice(0, LAST_ERROR_MAX);
};

export class GuildJobScheduler implements Stoppable {
	public readonly name = '길드 예약 작업';

	private readonly handlers = new Map<string, JobHandler>();
	private readonly inFlight = new Set<Promise<void>>();
	/** 이 프로세스에서 핸들러가 도는 작업 ID — stale 복구가 건드리지 않게 해요 */
	private readonly runningIds = new Set<string>();
	private claiming: Promise<unknown> | null = null;
	private timer: ReturnType<typeof setInterval> | null = null;
	private stopped = false;

	public constructor(private readonly deps: GuildJobSchedulerDeps) {}

	private now(): Date {
		return this.deps.now?.() ?? new Date();
	}

	/** kind별 핸들러 등록. 같은 kind를 두 번 등록하면 실수니까 던져요 */
	public register(kind: string, handler: JobHandler): void {
		if (this.handlers.has(kind)) throw new Error(`이미 등록된 예약 작업 종류예요: ${kind}`);
		this.handlers.set(kind, handler);
	}

	/** 주기 tick 시작 (clientReady에서 불러요). 두 번 불러도 타이머는 하나예요. */
	public start(): void {
		if (this.stopped || this.timer) return;
		this.timer = setInterval(() => void this.tick(), this.deps.intervalMs ?? JOB_TICK_INTERVAL_MS);
		this.timer.unref?.();
	}

	/** 새 작업 예약 */
	public schedule(job: NewScheduledJob): Promise<ScheduledJob> {
		return this.deps.db.scheduledJob.create({
			data: { guildId: job.guildId, kind: job.kind, runAt: job.runAt, payload: job.payload ?? {}, createdBy: job.createdBy }
		});
	}

	/** 아직 대기 중(pending)인 작업만 취소해요. 이미 실행 중이거나 끝난 작업이면 false */
	public async cancel(id: string): Promise<boolean> {
		const { count } = await this.deps.db.scheduledJob.deleteMany({ where: { id, status: 'pending' } });
		return count > 0;
	}

	/**
	 * 한 번의 tick: stale 복구 → 만기 작업 가져가기 → 핸들러 실행.
	 * 핸들러가 끝날 때까지 기다려서 돌려줘요 (주기 호출은 기다리지 않으니 긴 핸들러가 다음 tick을 막지 않아요).
	 */
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

	/** 새 tick을 멈추고 진행 중인 핸들러가 끝나길 기다려요 (타임아웃 있음). 못 끝낸 작업은 stale 복구가 되돌려요 */
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
			// 가져오는 중인 tick이 있으면 먼저 끝나야 진행 중 목록이 완성돼요
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

	/** 5분 넘게 running인 작업을 pending으로. 이 프로세스에서 아직 도는 작업은 건드리지 않아요 */
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
				await handler(job);
			} catch (error) {
				await this.fail(job, error);
				return;
			}
			await this.finish(job, { status: 'done' });
		} catch (error) {
			// 결과 기록 자체가 실패한 경우 — 5분 뒤 stale 복구가 되돌려요
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

	/** 내가 가져간 running 행만 갱신해요 — stale 복구로 다른 프로세스가 가져간 행은 덮어쓰지 않아요 */
	private async finish(job: ScheduledJob, data: Prisma.ScheduledJobUpdateManyMutationInput): Promise<void> {
		await this.deps.db.scheduledJob.updateMany({
			where: { id: job.id, status: 'running', lockedBy: this.deps.processId },
			data: { ...data, lockedBy: null, lockedAt: null }
		});
	}
}
