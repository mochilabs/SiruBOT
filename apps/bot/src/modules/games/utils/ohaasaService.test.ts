import { describe, expect, it } from 'vitest';
import { getZodiacFromDate } from './ohaasaService.ts';

describe('getZodiacFromDate (별자리 경계일)', () => {
	it('각 별자리의 시작 경계일은 그 별자리로 들어간다', () => {
		expect(getZodiacFromDate(3, 21)).toBe('01');
		expect(getZodiacFromDate(4, 20)).toBe('02');
		expect(getZodiacFromDate(5, 21)).toBe('03');
		expect(getZodiacFromDate(6, 22)).toBe('04');
		expect(getZodiacFromDate(7, 23)).toBe('05');
		expect(getZodiacFromDate(8, 23)).toBe('06');
		expect(getZodiacFromDate(9, 23)).toBe('07');
		expect(getZodiacFromDate(10, 23)).toBe('08');
		expect(getZodiacFromDate(11, 22)).toBe('09');
		expect(getZodiacFromDate(12, 22)).toBe('10');
		expect(getZodiacFromDate(1, 20)).toBe('11');
		expect(getZodiacFromDate(2, 19)).toBe('12');
	});

	it('각 별자리의 끝 경계일은 그 별자리에 남는다', () => {
		expect(getZodiacFromDate(3, 20)).toBe('12');
		expect(getZodiacFromDate(4, 19)).toBe('01');
		expect(getZodiacFromDate(5, 20)).toBe('02');
		expect(getZodiacFromDate(6, 21)).toBe('03');
		expect(getZodiacFromDate(7, 22)).toBe('04');
		expect(getZodiacFromDate(8, 22)).toBe('05');
		expect(getZodiacFromDate(9, 22)).toBe('06');
		expect(getZodiacFromDate(10, 22)).toBe('07');
		expect(getZodiacFromDate(11, 21)).toBe('08');
		expect(getZodiacFromDate(12, 21)).toBe('09');
		expect(getZodiacFromDate(1, 19)).toBe('10');
		expect(getZodiacFromDate(2, 18)).toBe('11');
	});

	it('연도 경계를 넘나드는 12월·1월·3월 경계를 모두 커버한다', () => {
		expect(getZodiacFromDate(12, 31)).toBe('10');
		expect(getZodiacFromDate(1, 1)).toBe('10');
		expect(getZodiacFromDate(3, 1)).toBe('12');
		expect(getZodiacFromDate(4, 1)).toBe('01');
	});
});
