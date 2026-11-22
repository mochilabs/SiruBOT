import { describe, expect, it, vi } from 'vitest';
import {
	GuildJobScheduler,
	type GuildJobSchedulerDeps,
	JOB_BACKOFF_MS,
	JOB_MAX_ATTEMPTS,
	JOB_STALE_AFTER_MS,
	type ScheduledJob
} from './guildJobScheduler.ts';

const NOW = new Date('2026-11-21T00:00:00Z');

const makeJob = (over: Partial<ScheduledJob> = {}): ScheduledJob => ({
	id: 'j1',
	guildId: 'g1',
	kind: 'test',
	runAt: NOW,
	payload: {},
	status: 'running',
	attempts: 0,
	lockedBy: 'p1',
	lockedAt: NOW,
	lastError: null,
	createdBy: 'u1',
	createdAt: NOW,
	updatedAt: NOW,
	...over
});

function setup(opts: { jobs?: ScheduledJob[][]; guilds?: string[]; stopTimeoutMs?: number; runInGuild?: GuildJobSchedulerDeps['runInGuild'] } = {}) {
	const claims = [...(opts.jobs ?? [[]])];
	const db = {
		$queryRaw: vi.fn(async () => claims.shift() ?? []),
		scheduledJob: {
			updateMany: vi.fn(async () => ({ count: 0 })),
			create: vi.fn(async ({ data }: { data: object }) => ({ id: 'new', ...data })),
			deleteMany: vi.fn(async () => ({ count: 1 }))
		}
	};
	const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
	const scheduler = new GuildJobScheduler({
		db: db as never,
		getOwnedGuildIds: () => opts.guilds ?? ['g1'],
		logger,
		now: () => NOW,
		processId: 'p1',
		stopTimeoutMs: opts.stopTimeoutMs,
		runInGuild: opts.runInGuild
	});
	return { db, logger, scheduler };
}

/** finish()가 보낸 마지막 결과 갱신 (stale 복구 호출은 status:'running' 조건이라 구분돼요) */
const lastResult = (db: ReturnType<typeof setup>['db']) => {
	const calls = db.scheduledJob.updateMany.mock.calls as unknown as Array<[{ where: Record<string, unknown>; data: Record<string, unknown> }]>;
	return calls.filter(([arg]) => arg.where.id === 'j1').at(-1)?.[0];
};

describe('tick 실행', () => {
	it('가져온 작업의 핸들러를 부르고 done으로 닫아요', async () => {
		const { scheduler, db } = setup({ jobs: [[makeJob()]] });
		const handler = vi.fn(async () => {});
		scheduler.register('test', handler);
		await scheduler.tick();
		expect(handler).toHaveBeenCalledOnce();
		expect(lastResult(db)).toEqual({
			where: { id: 'j1', status: 'running', lockedBy: 'p1' },
			data: { status: 'done', lockedBy: null, lockedAt: null }
		});
	});

	it('runInGuild가 있으면 핸들러를 작업의 길드 맥락 안에서 실행해요', async () => {
		const seen: string[] = [];
		const runInGuild: GuildJobSchedulerDeps['runInGuild'] = async (guildId, fn) => {
			seen.push(`enter:${guildId}`);
			try {
				return await fn();
			} finally {
				seen.push(`exit:${guildId}`);
			}
		};
		const { scheduler } = setup({ jobs: [[makeJob({ guildId: 'g1' })]], runInGuild });
		scheduler.register('test', async () => {
			seen.push('handler');
		});
		await scheduler.tick();
		expect(seen).toEqual(['enter:g1', 'handler', 'exit:g1']);
	});

	it('가진 길드가 없으면 DB를 건드리지 않아요', async () => {
		const { scheduler, db } = setup({ guilds: [] });
		await scheduler.tick();
		expect(db.$queryRaw).not.toHaveBeenCalled();
		expect(db.scheduledJob.updateMany).not.toHaveBeenCalled();
	});

	it('모르는 kind는 failed로 닫고 로그를 남겨요', async () => {
		const { scheduler, db, logger } = setup({ jobs: [[makeJob({ kind: 'nope' })]] });
		await scheduler.tick();
		expect(lastResult(db)?.data).toMatchObject({ status: 'failed', attempts: 1, lastError: 'unknown kind: nope' });
		expect(logger.error).toHaveBeenCalled();
	});

	it('같은 kind를 두 번 등록하면 던져요', () => {
		const { scheduler } = setup();
		scheduler.register('a', async () => {});
		expect(() => scheduler.register('a', async () => {})).toThrow();
	});
});

describe('실패와 백오프', () => {
	it('첫 실패는 30초 뒤로 미뤄요', async () => {
		const { scheduler, db } = setup({ jobs: [[makeJob()]] });
		scheduler.register('test', async () => {
			throw new Error('boom');
		});
		await scheduler.tick();
		expect(lastResult(db)?.data).toEqual({
			status: 'pending',
			attempts: 1,
			lastError: 'boom',
			runAt: new Date(NOW.getTime() + JOB_BACKOFF_MS[0]),
			lockedBy: null,
			lockedAt: null
		});
	});

	it('두 번째 실패는 2분 뒤예요', async () => {
		const { scheduler, db } = setup({ jobs: [[makeJob({ attempts: 1 })]] });
		scheduler.register('test', async () => {
			throw new Error('boom');
		});
		await scheduler.tick();
		expect(lastResult(db)?.data).toMatchObject({ status: 'pending', attempts: 2, runAt: new Date(NOW.getTime() + 120_000) });
	});

	it(`${JOB_MAX_ATTEMPTS}번째 실패는 failed + warn 로그예요`, async () => {
		const { scheduler, db, logger } = setup({ jobs: [[makeJob({ attempts: JOB_MAX_ATTEMPTS - 1 })]] });
		scheduler.register('test', async () => {
			throw new Error('boom');
		});
		await scheduler.tick();
		const data = lastResult(db)?.data;
		expect(data).toMatchObject({ status: 'failed', attempts: JOB_MAX_ATTEMPTS, lastError: 'boom' });
		expect(data).not.toHaveProperty('runAt');
		expect(logger.warn).toHaveBeenCalled();
	});
});

describe('stale 복구', () => {
	it('5분 넘게 running인 이 프로세스 길드의 작업을 같은 tick에서 pending으로 돌려요', async () => {
		const { scheduler, db } = setup();
		await scheduler.tick();
		expect(db.scheduledJob.updateMany).toHaveBeenCalledWith({
			where: { status: 'running', lockedAt: { lt: new Date(NOW.getTime() - JOB_STALE_AFTER_MS) }, guildId: { in: ['g1'] } },
			data: { status: 'pending', lockedBy: null, lockedAt: null }
		});
		// 복구 뒤에 가져가기가 이어져요
		expect(db.$queryRaw).toHaveBeenCalledOnce();
	});

	it('이 프로세스에서 아직 도는 작업은 복구에서 빼요', async () => {
		const { scheduler, db } = setup({ jobs: [[makeJob()]] });
		let release!: () => void;
		scheduler.register('test', () => new Promise<void>((resolve) => (release = resolve)));
		const first = scheduler.tick();
		await vi.waitFor(() => expect(release).toBeTypeOf('function'));
		await scheduler.tick();
		const calls = db.scheduledJob.updateMany.mock.calls as unknown as Array<[{ where: { id?: unknown } }]>;
		expect(calls.at(-1)?.[0].where.id).toEqual({ notIn: ['j1'] });
		release();
		await first;
	});
});

describe('stop', () => {
	it('진행 중인 핸들러가 끝나면 돌아와요', async () => {
		const { scheduler } = setup({ jobs: [[makeJob()]] });
		let release!: () => void;
		let finished = false;
		scheduler.register('test', () => new Promise<void>((resolve) => (release = () => ((finished = true), resolve()))));
		void scheduler.tick();
		await vi.waitFor(() => expect(release).toBeTypeOf('function'));
		const stopping = scheduler.stop();
		release();
		await stopping;
		expect(finished).toBe(true);
	});

	it('핸들러가 안 끝나면 타임아웃 뒤 warn을 남기고 돌아와요', async () => {
		const { scheduler, logger } = setup({ jobs: [[makeJob()]], stopTimeoutMs: 20 });
		let started = false;
		scheduler.register('test', () => new Promise<void>(() => (started = true)));
		void scheduler.tick();
		await vi.waitFor(() => expect(started).toBe(true));
		await scheduler.stop();
		expect(logger.warn).toHaveBeenCalledOnce();
	});

	it('stop 뒤에는 tick이 아무것도 가져가지 않고 타이머도 새로 안 만들어요', async () => {
		const { scheduler, db } = setup({ jobs: [[makeJob()]] });
		await scheduler.stop();
		await scheduler.tick();
		scheduler.start();
		expect(db.$queryRaw).not.toHaveBeenCalled();
	});

	it('stop이 가져오는 중인 tick을 기다렸다가 그 작업도 끝내요', async () => {
		const { scheduler, db } = setup({ jobs: [[makeJob()]] });
		let resolveClaim!: (jobs: ScheduledJob[]) => void;
		db.$queryRaw.mockImplementationOnce(() => new Promise((resolve) => (resolveClaim = resolve)));
		const handler = vi.fn(async () => {});
		scheduler.register('test', handler);
		const ticking = scheduler.tick();
		await vi.waitFor(() => expect(resolveClaim).toBeTypeOf('function'));
		const stopping = scheduler.stop();
		resolveClaim([makeJob()]);
		await Promise.all([ticking, stopping]);
		expect(handler).toHaveBeenCalledOnce();
	});

	it('주기 tick을 start로 돌리고 stop으로 멈춰요', async () => {
		vi.useFakeTimers();
		try {
			const { scheduler, db } = setup({ jobs: [[], [], []] });
			scheduler.start();
			await vi.advanceTimersByTimeAsync(15_000);
			expect(db.$queryRaw).toHaveBeenCalledTimes(1);
			await scheduler.stop();
			await vi.advanceTimersByTimeAsync(60_000);
			expect(db.$queryRaw).toHaveBeenCalledTimes(1);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('schedule / cancel', () => {
	it('schedule은 payload 기본값 {}로 행을 만들어요', async () => {
		const { scheduler, db } = setup();
		await scheduler.schedule({ guildId: 'g1', kind: 'k', runAt: NOW, createdBy: 'u1' });
		expect(db.scheduledJob.create).toHaveBeenCalledWith({ data: { guildId: 'g1', kind: 'k', runAt: NOW, payload: {}, createdBy: 'u1' } });
	});

	it('cancel은 pending만 지우고 결과를 돌려줘요', async () => {
		const { scheduler, db } = setup();
		await expect(scheduler.cancel('x')).resolves.toBe(true);
		expect(db.scheduledJob.deleteMany).toHaveBeenCalledWith({ where: { id: 'x', status: 'pending' } });
		db.scheduledJob.deleteMany.mockResolvedValueOnce({ count: 0 });
		await expect(scheduler.cancel('x')).resolves.toBe(false);
	});
});
