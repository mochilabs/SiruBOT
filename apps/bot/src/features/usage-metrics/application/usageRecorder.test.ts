import { describe, expect, it, vi } from 'vitest';
import { UsageRecorder, type UsageRecorderDeps } from './usageRecorder.ts';

const NOW = new Date('2026-11-21T03:00:00Z'); // KST 12:00 → 날짜 2026-11-21

function setup() {
	const upsert = vi.fn(async () => ({}));
	const markFirstUse = vi.fn(async () => undefined);
	const deps: UsageRecorderDeps = {
		db: { featureDailyUse: { upsert } } as never,
		firstUse: { markFirstUse },
		logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
		now: () => NOW
	};
	return { recorder: new UsageRecorder(deps), upsert, markFirstUse, deps };
}

describe('UsageRecorder', () => {
	it('여러 서버의 같은 날짜·feature를 서버·사용자 식별자 없이 한 행으로 합쳐요', async () => {
		const { recorder, upsert } = setup();
		recorder.record('g1', 'cmd:play', 'u1');
		recorder.record('g2', 'cmd:play', 'u2');
		recorder.record('g1', 'cmd:play', 'u1');
		await recorder.flush();

		expect(upsert).toHaveBeenCalledTimes(1);
		const arg = (upsert.mock.calls[0] as unknown[])[0] as {
			where: Record<string, unknown>;
			create: Record<string, unknown>;
			update: Record<string, unknown>;
		};
		expect(arg.where).toEqual({ day_feature: { day: new Date('2026-11-21T00:00:00.000Z'), feature: 'cmd:play' } });
		expect(arg.create).toEqual({ day: new Date('2026-11-21T00:00:00.000Z'), feature: 'cmd:play', count: 3 });
		expect(arg.update).toEqual({ count: { increment: 3 } });
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
