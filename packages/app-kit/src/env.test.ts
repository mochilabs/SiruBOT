import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { authKeyChain, parseEnvOrExit } from './env.ts';

describe('parseEnvOrExit', () => {
	const schema = z.object({ PORT: z.coerce.number(), NAME: z.string().default('app') });

	it('유효한 env는 파싱된 값을 돌려줘요', () => {
		expect(parseEnvOrExit(schema, { PORT: '3002' })).toEqual({ PORT: 3002, NAME: 'app' });
	});

	it('무효하면 throw해요 — 라이브러리가 프로세스를 종료하지 않고 진입점(main().catch)에 exit를 위임해요', () => {
		expect(() => parseEnvOrExit(schema, {} as NodeJS.ProcessEnv)).toThrow(/Invalid environment variables/);
	});

	it('throw에 어떤 필드가 잘못됐는지 담겨요', () => {
		expect(() => parseEnvOrExit(schema, { PORT: 'abc' } as NodeJS.ProcessEnv)).toThrow(/PORT/);
	});
});

describe('authKeyChain', () => {
	it('자체 키를 우선해요', () => {
		expect(authKeyChain('primary', 'shared')).toBe('primary');
	});

	it('자체 키가 없으면 공유 키로 폴백해요', () => {
		expect(authKeyChain(undefined, 'shared')).toBe('shared');
	});

	it('둘 다 없으면 undefined예요', () => {
		expect(authKeyChain(undefined, undefined)).toBeUndefined();
	});
});
