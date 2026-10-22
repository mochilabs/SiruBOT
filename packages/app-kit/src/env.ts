import type { z } from 'zod';

/**
 * envSchema.safeParse → 실패 시 채워진 에러를 throw해요 — 4개 앱(data-api·shardmanager·storage·notifier)의
 * validateEnv 공통 로직이에요. 라이브러리는 프로세스를 종료하지 않아요: 이 함수는 각 앱의 진입점 main() 탑레벨에서
 * 불리므로 throw는 그대로 기동 중단(fail-closed)으로 이어지고, 각 앱 진입점의 main().catch가 exit(1)을 수행해요.
 */
export function parseEnvOrExit<S extends z.ZodType>(schema: S, env: NodeJS.ProcessEnv = process.env): z.output<S> {
	const result = schema.safeParse(env);
	if (!result.success) {
		throw new Error(`Invalid environment variables:\n${result.error.message}`);
	}
	return result.data;
}

/** DATA_API_AUTH_KEY ?? AUTH_KEY 류 키 폴백 체인 — 자체 키를 우선 쓰고 없으면 공유 키로 폴백해요. */
export function authKeyChain(primary: string | undefined, shared: string | undefined): string | undefined {
	return primary ?? shared;
}
