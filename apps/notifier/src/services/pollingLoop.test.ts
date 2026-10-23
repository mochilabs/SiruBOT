import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@sirubot/prisma';
import { BREAKER_COOLDOWN_MS, BREAKER_THRESHOLD, PollingLoop, SubscriptionPoller, type NotifierLogger, type PollOutcome } from './pollingLoop.ts';
import type { NotifierRedis } from './redis.ts';

const INTERVAL_MS = 1_000;
const START_MESSAGE = '테스트 폴러를 시작해요.';
const BREAKER_OPEN_MESSAGE = `테스트 폴러가 ${BREAKER_THRESHOLD}틱 연속 실패: 봉쇄해요.`;

/** 테스트용 최소 폴러: pollOnce 호출 수와 결과만 조작해요. */
class FakePoller extends SubscriptionPoller {
	public pollCalls = 0;
	public outcome: PollOutcome;

	public constructor(
		options: { redis: NotifierRedis; getDb: () => PrismaClient | null; now?: () => number; logger: NotifierLogger },
		outcome: PollOutcome
	) {
		super(
			{ redis: options.redis, getDb: options.getDb, now: options.now },
			{
				name: 'fakePoller',
				intervalMs: INTERVAL_MS,
				lockKey: 'sirubot:test:poll-lock',
				lockTtlSeconds: 5,
				logger: options.logger,
				startMessage: START_MESSAGE,
				breakerOpenMessage: BREAKER_OPEN_MESSAGE
			}
		);
		this.outcome = outcome;
	}

	protected override async pollOnce(): Promise<PollOutcome> {
		this.pollCalls++;
		return this.outcome;
	}
}

function makePoller(outcome: PollOutcome, overrides: { acquireLock?: () => Promise<boolean>; db?: PrismaClient | null; now?: () => number } = {}) {
	const info = vi.fn();
	const error = vi.fn();
	const acquireLock = vi.fn(overrides.acquireLock ?? (async () => true));
	const db = overrides.db === undefined ? ({} as PrismaClient) : overrides.db;
	const poller = new FakePoller(
		{
			redis: { acquireLock } as unknown as NotifierRedis,
			getDb: () => db,
			now: overrides.now,
			logger: { info, error } as unknown as NotifierLogger
		},
		outcome
	);
	return { poller, acquireLock, info, error };
}

/** 폴러를 켜고 ticks번의 틱이 지나가게 해요 (첫 즉시 틱 + interval마다 1틱). */
async function runTicks(poller: FakePoller, ticks: number): Promise<void> {
	poller.start();
	await vi.advanceTimersByTimeAsync(0);
	for (let tick = 1; tick < ticks; tick++) await vi.advanceTimersByTimeAsync(INTERVAL_MS);
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('PollingLoop', () => {
	it('runs the first tick immediately on start', () => {
		const tick = vi.fn(async () => {});
		const loop = new PollingLoop({ name: 'test', intervalMs: INTERVAL_MS, tick });
		loop.start();
		expect(tick).toHaveBeenCalledTimes(1);
		loop.stop();
	});

	it('schedules the next tick every interval', async () => {
		const tick = vi.fn(async () => {});
		const loop = new PollingLoop({ name: 'test', intervalMs: INTERVAL_MS, tick });
		loop.start();
		await vi.advanceTimersByTimeAsync(2 * INTERVAL_MS);
		expect(tick).toHaveBeenCalledTimes(3);
		loop.stop();
	});

	it('waits one interval before the first tick when runImmediately is false', async () => {
		const tick = vi.fn(async () => {});
		const loop = new PollingLoop({ name: 'test', intervalMs: INTERVAL_MS, tick, runImmediately: false });
		loop.start();
		expect(tick).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(INTERVAL_MS);
		expect(tick).toHaveBeenCalledTimes(1);
		loop.stop();
	});

	it('stops scheduling after stop()', async () => {
		const tick = vi.fn(async () => {});
		const loop = new PollingLoop({ name: 'test', intervalMs: INTERVAL_MS, tick });
		loop.start();
		await vi.advanceTimersByTimeAsync(0);
		expect(loop.isRunning).toBe(true);
		loop.stop();
		await vi.advanceTimersByTimeAsync(3 * INTERVAL_MS);
		expect(tick).toHaveBeenCalledTimes(1);
		expect(loop.isRunning).toBe(false);
	});

	it('ignores a second start() while running', async () => {
		const tick = vi.fn(async () => {});
		const loop = new PollingLoop({ name: 'test', intervalMs: INTERVAL_MS, tick });
		loop.start();
		loop.start();
		await vi.advanceTimersByTimeAsync(INTERVAL_MS);
		expect(tick).toHaveBeenCalledTimes(2);
		loop.stop();
	});

	it('keeps polling after a throwing tick by default', async () => {
		const onError = vi.fn();
		const tick = vi.fn(async () => {
			throw new Error('일시 장애');
		});
		const loop = new PollingLoop({ name: 'test', intervalMs: INTERVAL_MS, tick, onError });
		loop.start();
		await vi.advanceTimersByTimeAsync(2 * INTERVAL_MS);
		expect(tick).toHaveBeenCalledTimes(3);
		expect(onError).toHaveBeenCalledTimes(3);
		loop.stop();
	});

	it('aborts the loop on a throwing tick with errorPolicy abort', async () => {
		const onError = vi.fn();
		const tick = vi.fn(async () => {
			throw new Error('치명 장애');
		});
		const loop = new PollingLoop({ name: 'test', intervalMs: INTERVAL_MS, tick, errorPolicy: 'abort', onError });
		loop.start();
		await vi.advanceTimersByTimeAsync(2 * INTERVAL_MS);
		expect(tick).toHaveBeenCalledTimes(1);
		expect(onError).toHaveBeenCalledTimes(1);
		expect((onError.mock.calls[0] as unknown as [Error])[0].message).toBe('치명 장애');
		expect(loop.isRunning).toBe(false);
		// 다시 시동하면 새 세대로 돌아요.
		loop.start();
		await vi.advanceTimersByTimeAsync(0);
		expect(tick).toHaveBeenCalledTimes(2);
		loop.stop();
	});

	it('does not re-enter the tick body and drops stale chains across a stop/start cycle', async () => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => (release = resolve));
		const tick = vi.fn(async () => {
			if (tick.mock.calls.length === 1) await gate;
		});
		const loop = new PollingLoop({ name: 'test', intervalMs: INTERVAL_MS, tick });
		loop.start();
		expect(tick).toHaveBeenCalledTimes(1); // 즉시 틱이 몸통을 점유 중
		loop.stop();
		loop.start(); // 몸통이 진행 중이므로 건너뛰고 다음 틱만 예약해요.
		expect(tick).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(2 * INTERVAL_MS);
		expect(tick).toHaveBeenCalledTimes(1); // gate가 안 열렸으니 몸통은 계속 점유 상태
		release();
		await vi.advanceTimersByTimeAsync(0); // 이전 세대 몸통 종료: 세대가 달라 예약은 무시돼요.
		await vi.advanceTimersByTimeAsync(INTERVAL_MS);
		expect(tick).toHaveBeenCalledTimes(2); // 새 세대 타이머 연쇄만 살아 있어요.
		loop.stop();
		await vi.advanceTimersByTimeAsync(3 * INTERVAL_MS);
		expect(tick).toHaveBeenCalledTimes(2);
	});
});

describe('SubscriptionPoller', () => {
	it('polls once immediately and then every interval, logging the start message once', async () => {
		const { poller, info } = makePoller('ok');
		poller.start();
		poller.start();
		await vi.advanceTimersByTimeAsync(0);
		expect(info).toHaveBeenCalledTimes(1);
		expect(info).toHaveBeenCalledWith(START_MESSAGE);
		expect(poller.pollCalls).toBe(1);
		await vi.advanceTimersByTimeAsync(2 * INTERVAL_MS);
		expect(poller.pollCalls).toBe(3);
		poller.stop();
	});

	it('skips the domain poll when the lock is not acquired', async () => {
		const { poller, acquireLock } = makePoller('ok', { acquireLock: async () => false });
		await runTicks(poller, 3);
		expect(poller.pollCalls).toBe(0);
		expect(acquireLock).toHaveBeenCalledTimes(3);
		poller.stop();
	});

	it('skips the domain poll when db is missing', async () => {
		const { poller } = makePoller('ok', { db: null });
		await runTicks(poller, 3);
		expect(poller.pollCalls).toBe(0);
		poller.stop();
	});

	it('opens the breaker after five failed ticks and retries after the cooldown (half-open)', async () => {
		let fakeNow = 1_700_000_000_000;
		const { poller, error } = makePoller('failed', { now: () => fakeNow });
		await runTicks(poller, BREAKER_THRESHOLD);
		expect(poller.pollCalls).toBe(BREAKER_THRESHOLD);
		expect(error).toHaveBeenCalledTimes(1);
		expect(error).toHaveBeenCalledWith(BREAKER_OPEN_MESSAGE);
		await vi.advanceTimersByTimeAsync(3 * INTERVAL_MS);
		expect(poller.pollCalls).toBe(BREAKER_THRESHOLD); // 봉쇄 중: 도메인 폴링 없음
		fakeNow += BREAKER_COOLDOWN_MS + 1; // 쿨다운 종료
		await vi.advanceTimersByTimeAsync(INTERVAL_MS);
		expect(poller.pollCalls).toBe(BREAKER_THRESHOLD + 1); // half-open 재시도
		poller.stop();
	});

	it('keeps consecutive failures across skipped ticks and resets them on a successful tick', async () => {
		const fakeNow = 1_700_000_000_000;
		const first = makePoller('failed', { now: () => fakeNow });
		await runTicks(first.poller, 4); // 실패 4연속
		first.poller.outcome = 'skipped';
		await vi.advanceTimersByTimeAsync(INTERVAL_MS); // 건너뛴 틱은 실패 계정에 영향을 주지 않아요
		first.poller.outcome = 'failed';
		await vi.advanceTimersByTimeAsync(INTERVAL_MS); // 5번째 실패: 브레이커 개방
		expect(first.poller.pollCalls).toBe(6);
		first.poller.outcome = 'ok';
		await vi.advanceTimersByTimeAsync(2 * INTERVAL_MS);
		expect(first.poller.pollCalls).toBe(6); // 봉쇄 중이라 성공 틱도 폴링 자체를 건너뛰어요
		first.poller.stop();

		const second = makePoller('failed', { now: () => fakeNow });
		await runTicks(second.poller, 4); // 실패 4연속
		second.poller.outcome = 'ok';
		await vi.advanceTimersByTimeAsync(INTERVAL_MS); // 성공: 카운트 리셋
		second.poller.outcome = 'failed';
		await vi.advanceTimersByTimeAsync(4 * INTERVAL_MS); // 실패 4연속: 브레이커 미개방
		expect(second.poller.pollCalls).toBe(9);
		second.poller.stop();
	});
});
