import { describe, expect, it } from 'vitest';
import { nextRunAt, parseTimeOfDay } from './jobRecurrence.js';

const kst = (text: string) => new Date(`${text}+09:00`);

describe('parseTimeOfDay', () => {
	it('HH:mm을 풀어요', () => {
		expect(parseTimeOfDay('09:05')).toEqual({ hour: 9, minute: 5 });
		expect(parseTimeOfDay('23:59')).toEqual({ hour: 23, minute: 59 });
	});
	it('형식이 틀리면 던져요', () => {
		for (const bad of ['24:00', '9:00', '12:60', '', 'ab:cd']) expect(() => parseTimeOfDay(bad)).toThrow(RangeError);
	});
});

describe('nextRunAt daily', () => {
	it('오늘 시각이 아직이면 오늘이에요', () => {
		expect(nextRunAt({ type: 'daily', time: '09:00' }, kst('2026-11-21T08:00:00'))).toEqual(kst('2026-11-21T09:00:00'));
	});
	it('정확히 그 시각이면 다음 날이에요 (같은 순간은 제외)', () => {
		expect(nextRunAt({ type: 'daily', time: '09:00' }, kst('2026-11-21T09:00:00'))).toEqual(kst('2026-11-22T09:00:00'));
	});
	it('KST 자정 직후·직전을 날짜 경계로 다뤄요', () => {
		expect(nextRunAt({ type: 'daily', time: '00:00' }, kst('2026-11-21T23:59:59'))).toEqual(kst('2026-11-22T00:00:00'));
		expect(nextRunAt({ type: 'daily', time: '00:30' }, kst('2026-11-22T00:00:00'))).toEqual(kst('2026-11-22T00:30:00'));
	});
	it('UTC로는 전날인 KST 새벽도 KST 날짜로 계산해요', () => {
		expect(nextRunAt({ type: 'daily', time: '09:00' }, new Date('2026-11-21T20:00:00Z'))).toEqual(kst('2026-11-22T09:00:00'));
	});
	it('연말을 넘겨요', () => {
		expect(nextRunAt({ type: 'daily', time: '09:00' }, kst('2026-12-31T10:00:00'))).toEqual(kst('2027-01-01T09:00:00'));
	});
});

describe('nextRunAt weekly', () => {
	it('이번 주 남은 요일을 골라요', () => {
		expect(nextRunAt({ type: 'weekly', weekday: 1, time: '09:00' }, kst('2026-11-21T10:00:00'))).toEqual(kst('2026-11-23T09:00:00'));
	});
	it('오늘 요일인데 시각이 지났으면 다음 주예요', () => {
		expect(nextRunAt({ type: 'weekly', weekday: 6, time: '09:00' }, kst('2026-11-21T10:00:00'))).toEqual(kst('2026-11-28T09:00:00'));
	});
	it('오늘 요일이고 시각 전이면 오늘이에요', () => {
		expect(nextRunAt({ type: 'weekly', weekday: 6, time: '18:00' }, kst('2026-11-21T10:00:00'))).toEqual(kst('2026-11-21T18:00:00'));
	});
	it('월을 넘겨요', () => {
		expect(nextRunAt({ type: 'weekly', weekday: 0, time: '09:00' }, kst('2026-11-29T10:00:00'))).toEqual(kst('2026-12-06T09:00:00'));
	});
	it('잘못된 요일은 던져요', () => {
		expect(() => nextRunAt({ type: 'weekly', weekday: 7, time: '09:00' }, new Date())).toThrow(RangeError);
	});
});

describe('nextRunAt monthly', () => {
	it('이번 달 날짜가 아직이면 이번 달이에요', () => {
		expect(nextRunAt({ type: 'monthly', day: 25, time: '09:00' }, kst('2026-11-21T10:00:00'))).toEqual(kst('2026-11-25T09:00:00'));
	});
	it('지났으면 다음 달이에요', () => {
		expect(nextRunAt({ type: 'monthly', day: 5, time: '09:00' }, kst('2026-11-21T10:00:00'))).toEqual(kst('2026-12-05T09:00:00'));
	});
	it('12월에서 다음 해 1월로 넘어가요', () => {
		expect(nextRunAt({ type: 'monthly', day: 5, time: '09:00' }, kst('2026-12-21T10:00:00'))).toEqual(kst('2027-01-05T09:00:00'));
	});
	it('없는 날은 그 달 마지막 날이에요 (평년 2월)', () => {
		expect(nextRunAt({ type: 'monthly', day: 31, time: '09:00' }, kst('2027-01-31T10:00:00'))).toEqual(kst('2027-02-28T09:00:00'));
	});
	it('윤년 2월은 29일이에요', () => {
		expect(nextRunAt({ type: 'monthly', day: 30, time: '09:00' }, kst('2028-01-30T10:00:00'))).toEqual(kst('2028-02-29T09:00:00'));
	});
	it('30일까지인 달에서 31일 규칙은 30일에 돌고, 다음엔 31일로 돌아와요', () => {
		const first = nextRunAt({ type: 'monthly', day: 31, time: '09:00' }, kst('2026-11-01T00:00:00'));
		expect(first).toEqual(kst('2026-11-30T09:00:00'));
		expect(nextRunAt({ type: 'monthly', day: 31, time: '09:00' }, first)).toEqual(kst('2026-12-31T09:00:00'));
	});
	it('월말 자정 경계: 1일 00:00 규칙은 UTC로는 전달 15:00이에요', () => {
		const next = nextRunAt({ type: 'monthly', day: 1, time: '00:00' }, kst('2026-11-30T23:59:59'));
		expect(next).toEqual(kst('2026-12-01T00:00:00'));
		expect(next.toISOString()).toBe('2026-11-30T15:00:00.000Z');
	});
	it('잘못된 날짜는 던져요', () => {
		expect(() => nextRunAt({ type: 'monthly', day: 0, time: '09:00' }, new Date())).toThrow(RangeError);
		expect(() => nextRunAt({ type: 'monthly', day: 32, time: '09:00' }, new Date())).toThrow(RangeError);
	});
});
