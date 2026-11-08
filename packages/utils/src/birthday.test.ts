import { describe, expect, it } from 'vitest';

import { birthdayInputSchema, isValidBirthday } from './birthday.ts';

describe('isValidBirthday', () => {
	it('accepts real month/day pairs including Feb 29', () => {
		expect(isValidBirthday(1, 31)).toBe(true);
		expect(isValidBirthday(2, 29)).toBe(true);
		expect(isValidBirthday(12, 25)).toBe(true);
	});

	it('rejects days that do not exist in the month', () => {
		expect(isValidBirthday(2, 30)).toBe(false);
		expect(isValidBirthday(4, 31)).toBe(false);
		expect(isValidBirthday(13, 1)).toBe(false);
		expect(isValidBirthday(0, 1)).toBe(false);
		expect(isValidBirthday(5, 0)).toBe(false);
		expect(isValidBirthday(5.5, 1)).toBe(false);
	});
});

describe('birthdayInputSchema', () => {
	it('parses a valid body', () => {
		expect(birthdayInputSchema.parse({ month: 10, day: 14 })).toEqual({ month: 10, day: 14 });
	});

	it('rejects impossible dates and non-numbers', () => {
		expect(birthdayInputSchema.safeParse({ month: 2, day: 30 }).success).toBe(false);
		expect(birthdayInputSchema.safeParse({ month: '10', day: 14 }).success).toBe(false);
		expect(birthdayInputSchema.safeParse({}).success).toBe(false);
	});
});
