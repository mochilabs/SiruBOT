import { afterEach, describe, expect, it } from 'vitest';
import { getLoggerSettings } from '@sirubot/utils';

import { getAppLogger, resolveMinLevel } from './logger.ts';

// resolveMinLevel은 packages/utils/src/logger.ts(getLoggerSettings)의 미러예요.
// 미러 드리프트는 아래 "packages/utils logger 미러 동기화" describe가 잡아요.

const originalLoglevel = process.env.LOGLEVEL;

afterEach(() => {
	if (originalLoglevel === undefined) delete process.env.LOGLEVEL;
	else process.env.LOGLEVEL = originalLoglevel;
});

describe('resolveMinLevel', () => {
	it('미설정이면 info(3)예요', () => {
		delete process.env.LOGLEVEL;
		expect(resolveMinLevel()).toBe(3);
	});

	it('숫자면 그대로 써요', () => {
		process.env.LOGLEVEL = '5';
		expect(resolveMinLevel()).toBe(5);
	});

	it('레벨 이름은 매핑해요', () => {
		process.env.LOGLEVEL = 'warn';
		expect(resolveMinLevel()).toBe(4);
		process.env.LOGLEVEL = 'debug';
		expect(resolveMinLevel()).toBe(2);
	});

	it('미식별 값은 info(3)로 폴백해요', () => {
		process.env.LOGLEVEL = 'bogus';
		expect(resolveMinLevel()).toBe(3);
	});
});

describe('getAppLogger', () => {
	it('앱 이름 루트 로거의 서브로거 팩토리를 돌려줘요', () => {
		const getSubLogger = getAppLogger('TestApp');
		expect(typeof getSubLogger).toBe('function');
		const sub = getSubLogger('auth');
		expect(sub).toBeDefined();
	});
});

describe('packages/utils logger 미러 동기화', () => {
	it('LOGLEVEL 해석(minLevel)이 utils getLoggerSettings와 일치해요', () => {
		const samples = [undefined, '0', '5', 'info', 'WARN', 'debug', 'fatal', 'bogus'];
		for (const value of samples) {
			if (value === undefined) delete process.env.LOGLEVEL;
			else process.env.LOGLEVEL = value;
			expect(resolveMinLevel(), `LOGLEVEL=${String(value)}`).toBe(getLoggerSettings('Sync').minLevel);
		}
	});

	it('기본 설정(type pretty, minLevel info)도 utils와 같은 값을 줘요', () => {
		delete process.env.LOGLEVEL;
		const utilsSettings = getLoggerSettings('Sync');
		expect(utilsSettings.type).toBe('pretty');
		expect(utilsSettings.minLevel).toBe(3);
		expect(resolveMinLevel()).toBe(utilsSettings.minLevel);
	});
});
