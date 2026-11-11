import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { db, redisStore } = vi.hoisted(() => ({
	db: {
		user: { upsert: vi.fn() },
		gameRecord: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() }
	},
	redisStore: { setCacheValueNX: vi.fn() }
}));

vi.mock('@sapphire/framework', () => ({ container: { db, redisStore } }));
// 이모지 매핑은 스토어 로드 후에야 채워진다. 뱃지 판정 테스트는 이름만 보게 한다
vi.mock('@sirubot/utils', () => ({ emoji: (name: string) => name }));

import { doCheckin, getCheckinState, getGuessBest, getRpsStats, streakBadge } from './gameRecords.ts';

beforeEach(() => {
	vi.clearAllMocks();
	db.gameRecord.findMany.mockResolvedValue([]);
	db.gameRecord.findFirst.mockResolvedValue(null);
	db.gameRecord.create.mockResolvedValue({});
	db.user.upsert.mockResolvedValue({});
	redisStore.setCacheValueNX.mockResolvedValue(true);
});

afterEach(() => {
	vi.useRealTimers();
});

describe('getRpsStats (연승·최고 연승 집계)', () => {
	it('최근 기록 순서대로 승패무를 집계하고 맨 앞 연승을 스티reak로 본다', async () => {
		// 최신 기록이 앞: [최신 … 과거]
		db.gameRecord.findMany.mockResolvedValue([
			{ result: 'win' },
			{ result: 'win' },
			{ result: 'win' },
			{ result: 'loss' },
			{ result: 'win' },
			{ result: 'draw' }
		]);

		await expect(getRpsStats('u1')).resolves.toEqual({ wins: 4, losses: 1, draws: 1, streak: 3, best: 3 });
	});

	it('연승이 끊겼으면 최신 연승은 0이지만 과거의 긴 연승은 best로 남는다', async () => {
		db.gameRecord.findMany.mockResolvedValue([{ result: 'loss' }, { result: 'win' }, { result: 'win' }, { result: 'win' }, { result: 'win' }]);

		await expect(getRpsStats('u1')).resolves.toMatchObject({ streak: 0, best: 4 });
	});
});

describe('출석 스트릭 (KST 날짜 경계)', () => {
	it('KST 자정(UTC 15:00) 직전에는 같은 날로 보고 중복 출석을 막는다', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T14:59:00Z')); // KST 2026-01-01 23:59
		db.gameRecord.findFirst.mockResolvedValue({ meta: { streak: 3, day: '2026-01-01' } });

		await expect(doCheckin('u1')).resolves.toEqual({ checkedIn: true, streak: 3 });
		expect(db.gameRecord.create).not.toHaveBeenCalled();
	});

	it('KST 자정을 넘기면 어제 출석이어도 스트릭을 이어 붙인다', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T15:01:00Z')); // KST 2026-01-02 00:01
		db.gameRecord.findFirst.mockResolvedValue({ meta: { streak: 3, day: '2026-01-01' } });

		await expect(doCheckin('u1')).resolves.toEqual({ checkedIn: false, streak: 4 });
		expect(db.gameRecord.create).toHaveBeenCalledWith({
			data: { userId: 'u1', game: 'attendance', result: 'checkin', meta: { streak: 4, day: '2026-01-02' } }
		});
	});

	it('출석이 끊겼으면 스트릭을 1부터 다시 쌓는다', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T03:00:00Z')); // KST 2026-01-01 12:00
		db.gameRecord.findFirst.mockResolvedValue({ meta: { streak: 9, day: '2025-12-29' } });

		await expect(doCheckin('u1')).resolves.toEqual({ checkedIn: false, streak: 1 });
	});

	it('기록이 전혀 없으면 첫 출석으로 스트릭 1을 남긴다', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-03-10T02:00:00Z')); // KST 2026-03-10 11:00

		await expect(doCheckin('u1')).resolves.toEqual({ checkedIn: false, streak: 1 });
		expect(db.user.upsert).toHaveBeenCalledWith({ where: { id: 'u1' }, create: { id: 'u1' }, update: {} });
		expect(db.gameRecord.create).toHaveBeenCalledWith({
			data: { userId: 'u1', game: 'attendance', result: 'checkin', meta: { streak: 1, day: '2026-03-10' } }
		});
	});

	it('Redis 락이 이미 선점됐으면(진행 중 구간) 기록 없이 현 스트릭으로 응답한다', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-03-10T02:00:00Z'));
		redisStore.setCacheValueNX.mockResolvedValue(false);
		db.gameRecord.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ meta: { streak: 7, day: '2026-03-10' } });

		await expect(doCheckin('u1')).resolves.toEqual({ checkedIn: true, streak: 7 });
		expect(db.gameRecord.create).not.toHaveBeenCalled();
	});
});

describe('getCheckinState / streakBadge', () => {
	it('meta가 깨졌어도 기본값으로 조회한다', async () => {
		db.gameRecord.findFirst.mockResolvedValue({ meta: { note: 'x' } });
		await expect(getCheckinState('u1')).resolves.toEqual({ checkedIn: false, streak: 0, lastDay: null });
	});

	it('스트릭 구간에 맞는 뱃지 이름을 준다', () => {
		expect(streakBadge(0)).toBe('');
		expect(streakBadge(1)).toBe('sprout');
		expect(streakBadge(6)).toBe('sprout');
		expect(streakBadge(7)).toBe('fire');
		expect(streakBadge(29)).toBe('fire');
		expect(streakBadge(30)).toBe('flash');
		expect(streakBadge(100)).toBe('crown');
		expect(streakBadge(365)).toBe('gem');
	});
});

describe('getGuessBest (숫자맞히기 개인 최고 기록)', () => {
	it('여러 기록 중 시도 횟수 최솟값을 고른다', async () => {
		db.gameRecord.findMany.mockResolvedValue([{ meta: { attempts: 5 } }, { meta: { attempts: 2 } }, { meta: { attempts: 9 } }]);

		await expect(getGuessBest('u1')).resolves.toBe(2);
	});

	it('깨진 meta(0 이하·정수 아님·형식 불일치)는 걸러내고 유효값만 본다', async () => {
		db.gameRecord.findMany.mockResolvedValue([
			{ meta: { attempts: 0 } },
			{ meta: { attempts: 1.5 } },
			{ meta: { attempts: '3' } },
			{ meta: null },
			{ meta: { attempts: 4 } }
		]);

		await expect(getGuessBest('u1')).resolves.toBe(4);
	});

	it('유효한 기록이 없으면 null을 반환한다', async () => {
		db.gameRecord.findMany.mockResolvedValue([]);

		await expect(getGuessBest('u1')).resolves.toBeNull();
	});
});
