import type { z } from 'zod';

/**
 * envSchema.safeParse → 실패 시 포맷된 에러를 찍고 process.exit(1) — 4개 앱의 validateEnv 공통 로직이에요.
 */
export function parseEnvOrExit<S extends z.ZodType>(schema: S, env: NodeJS.ProcessEnv = process.env): z.output<S> {
	const result = schema.safeParse(env);
	if (!result.success) {
		console.error('❌ Invalid environment variables:');
		console.error(result.error.format());
		process.exit(1);
	}
	return result.data;
}

/** DATA_API_AUTH_KEY ?? AUTH_KEY 류 키 폴백 체인 — 자체 키를 우선 쓰고 없으면 공유 키로 폴백해요. */
export function authKeyChain(primary: string | undefined, shared: string | undefined): string | undefined {
	return primary ?? shared;
}
