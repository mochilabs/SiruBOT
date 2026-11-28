import { afterEach, describe, expect, it } from 'vitest';
import { getLoggerSettings } from './logger.ts';

const originalLoglevel = process.env.LOGLEVEL;

afterEach(() => {
	if (originalLoglevel === undefined) delete process.env.LOGLEVEL;
	else process.env.LOGLEVEL = originalLoglevel;
});

describe('getLoggerSettings', () => {
	it('기본은 pretty + minLevel info(3)예요', () => {
		const settings = getLoggerSettings('Test');
		expect(settings.name).toBe('Test');
		expect(settings.type).toBe('pretty');
		expect(settings.minLevel).toBe(3);
	});

	it('LOGLEVEL이 숫자면 그대로 써요', () => {
		process.env.LOGLEVEL = '5';
		expect(getLoggerSettings('Test').minLevel).toBe(5);
	});

	it('LOGLEVEL이 레벨 이름이면 매핑해요', () => {
		process.env.LOGLEVEL = 'warn';
		expect(getLoggerSettings('Test').minLevel).toBe(4);
		process.env.LOGLEVEL = 'DEBUG';
		expect(getLoggerSettings('Test').minLevel).toBe(2);
	});

	it('미설정·미식별 값은 info(3)로 폴백해요', () => {
		process.env.LOGLEVEL = 'bogus';
		expect(getLoggerSettings('Test').minLevel).toBe(3);
	});

	it('호출부 settings가 기본값을 덮어써요', () => {
		expect(getLoggerSettings('Test', { minLevel: 0 }).minLevel).toBe(0);
	});
});
