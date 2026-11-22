import { describe, expect, it } from 'vitest';
import { formatClock } from './format.ts';

describe('formatClock', () => {
	it('1시간 미만은 m:ss로 써요', () => {
		expect(formatClock(0)).toBe('0:00');
		expect(formatClock(65_000)).toBe('1:05');
	});

	it('1시간 이상은 h:mm:ss로 써요', () => {
		expect(formatClock(3_725_000)).toBe('1:02:05');
	});

	it('음수는 0으로 맞춰요', () => {
		expect(formatClock(-5)).toBe('0:00');
	});
});
