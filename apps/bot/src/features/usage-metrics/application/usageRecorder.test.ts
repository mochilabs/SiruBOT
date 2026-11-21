import { describe, expect, it, vi } from 'vitest';
import { UsageRecorder, usageUserSetKey, type UsageRecorderDeps } from './usageRecorder.ts';

const NOW = new Date('2026-11-21T03:00:00Z'); // KST 12:00 → 날짜 2026-11-21

function setup(redisSize: number | null = 2) {
	const upsert = vi.fn(async () => ({}));
	const addToSetAndCount = vi.fn(async () => redisSize);
	const markFirstUse = vi.fn(async () => undefined);
	const deps: UsageRecorderDeps = {
		db: { featureDailyUse: { upsert } } as never,
		getRedisStore: () => ({ addToSetAndCount }),
		firstUse: { markFirstUse },
		logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
		now: () => NOW
	};
	return { recorder: new UsageRecorder(deps), upsert, addToSetAndCount, markFirstUse, deps };
}

describe('UsageRecorder', () => {
	it('같은 서버·날짜·feature는 한 행으로 모아 count를 더해요', async () => {
		const { recorder, upsert, addToSetAndCount } = setup(2);
		recorder.record('g1', 'cmd:play', 'u1');
		recorder.record('g1', 'cmd:play', 'u2');
		recorder.record('g1', 'cmd:play', 'u1');
		await recorder.flush();

		expect(addToSetAndCount).toHaveBeenCalledWith(usageUserSetKey('2026-11-21', 'g1', 'cmd:play'), ['u1', 'u2'], 48 * 60 * 60);
		expect(upsert).toHaveBeenCalledTimes(1);
		const arg = (upsert.mock.calls[0] as unknown[])[0] as { create: Record<string, unknown>; update: Record<string, unknown> };
		expect(arg.create).toMatchObject({ guildId: 'g1', feature: 'cmd:play', count: 3, users: 2 });
		expect(arg.update).toEqual({ count: { increment: 3 }, users: 2 });
	});

	it('Redis가 없으면 새 행은 메모리 크기로 근사하고 기존 행의 users는 건드리지 않아요', async () => {
		const { recorder, upsert } = setup(null);
		recorder.record('g1', 'msg:counting', 'u1');
		recorder.record('g1', 'msg:counting', 'u2');
		await recorder.flush();
		const arg = (upsert.mock.calls[0] as unknown[])[0] as { create: Record<string, unknown>; update: Record<string, unknown> };
		expect(arg.create).toMatchObject({ count: 2, users: 2 });
		expect(arg.update).toEqual({ count: { increment: 2 } });
	});

	it('DM과 빈 서버 ID는 버려요', async () => {
		const { recorder, upsert } = setup();
		recorder.record(null, 'cmd:help', 'u1');
		recorder.record(undefined, 'cmd:help', 'u1');
		await recorder.flush();
		expect(upsert).not.toHaveBeenCalled();
	});

	it('첫 사용은 서버마다 한 번만 기록하고 온보딩 발송은 세지 않아요', async () => {
		const { recorder, markFirstUse } = setup();
		recorder.record('g1', 'onboarding:sent');
		await recorder.flush();
		expect(markFirstUse).not.toHaveBeenCalled();

		recorder.record('g1', 'cmd:play', 'u1');
		recorder.record('g2', 'cmd:play', 'u1');
		await recorder.flush();
		expect(markFirstUse).toHaveBeenCalledWith(['g1', 'g2'], NOW);

		recorder.record('g1', 'cmd:skip', 'u1');
		await recorder.flush();
		expect(markFirstUse).toHaveBeenCalledTimes(1);
	});

	it('flush 실패는 경고만 남기고 다음 묶음은 계속 받아요', async () => {
		const { recorder, upsert, deps } = setup();
		upsert.mockRejectedValueOnce(new Error('db down'));
		recorder.record('g1', 'cmd:play', 'u1');
		await recorder.flush();
		expect(deps.logger.warn).toHaveBeenCalled();

		recorder.record('g1', 'cmd:play', 'u1');
		await recorder.flush();
		expect(upsert).toHaveBeenCalledTimes(2);
	});

	it('stop()은 남은 집계를 보내고 이후 기록은 받지 않아요', async () => {
		const { recorder, upsert } = setup();
		recorder.start();
		recorder.record('g1', 'cmd:play', 'u1');
		await recorder.stop();
		expect(upsert).toHaveBeenCalledTimes(1);

		recorder.record('g1', 'cmd:play', 'u1');
		await recorder.flush();
		expect(upsert).toHaveBeenCalledTimes(1);
	});

	it('주기 타이머가 flush해요', async () => {
		vi.useFakeTimers();
		try {
			const { recorder, upsert } = setup();
			recorder.start();
			recorder.start(); // 두 번 불러도 타이머 하나
			recorder.record('g1', 'cmd:play', 'u1');
			await vi.advanceTimersByTimeAsync(60_000);
			expect(upsert).toHaveBeenCalledTimes(1);
			await recorder.stop();
		} finally {
			vi.useRealTimers();
		}
	});
});
