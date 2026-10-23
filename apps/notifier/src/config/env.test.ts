import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateEnv } from './env.ts';

// validateEnv는 process.env를 읽고 키가 없으면 process.exit(1)로 기동을 거부해요 (fail-closed).

const KEY_NAMES = ['NOTIFIER_AUTH_KEY', 'AUTH_KEY'] as const;

describe('validateEnv fail-closed', () => {
	beforeEach(() => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
			throw new Error(`process.exit(${code})`);
		}) as never);
		for (const key of KEY_NAMES) delete process.env[key];
	});

	afterEach(() => {
		vi.restoreAllMocks();
		for (const key of KEY_NAMES) delete process.env[key];
	});

	it('키가 둘 다 없으면 process.exit(1)로 기동을 거부해요', () => {
		expect(() => validateEnv()).toThrow('process.exit(1)');
		expect(console.error).toHaveBeenCalledWith('NOTIFIER_AUTH_KEY 또는 AUTH_KEY 중 하나는 반드시 설정해야 해요.');
	});

	it('NOTIFIER_AUTH_KEY만 있으면 그 키로 기동해요', () => {
		process.env.NOTIFIER_AUTH_KEY = 'notifier-key';
		expect(validateEnv()).toMatchObject({ notifierAuthKey: 'notifier-key' });
	});

	it('AUTH_KEY만 있으면 폴백 키로 기동해요', () => {
		process.env.AUTH_KEY = 'shared-key';
		expect(validateEnv()).toMatchObject({ notifierAuthKey: 'shared-key' });
	});

	it('둘 다 있으면 NOTIFIER_AUTH_KEY를 우선해요', () => {
		process.env.NOTIFIER_AUTH_KEY = 'notifier-key';
		process.env.AUTH_KEY = 'shared-key';
		expect(validateEnv()).toMatchObject({ notifierAuthKey: 'notifier-key' });
	});
});
