import { z } from 'zod';
import { authKeyChain, parseEnvOrExit } from '@sirubot/app-kit';

const envSchema = z
	.object({
		PORT: z.coerce.number().default(3002),
		REDIS_URL: z.string().optional(),
		// data-api는 자체 키(DATA_API_AUTH_KEY)를 우선 사용하고, 없으면 봇과 공유하는 AUTH_KEY로 폴백해요.
		DATA_API_AUTH_KEY: z.string().optional(),
		AUTH_KEY: z.string().optional(),
		OPENAI_COMPATIBLE_API_URL: z.string().default('http://127.0.0.1:8080/v1'),
		OPENAI_API_KEY: z.string().optional(),
		TRANSLATION_MODEL: z.string().default('default'),
		// 커스텀 명령어 초안 생성 모델 — 미설정이면 TRANSLATION_MODEL을 써요
		CUSTOM_COMMAND_DRAFT_MODEL: z.string().optional(),
		// 오하아사 일일 갱신 시각 (KST). '06:50' 형태
		OHAASA_REFRESH_AT: z.string().default('06:50'),
		// 메모리 정리(nightly pass) — DATABASE_URL이 있을 때만 활성화돼요
		DATABASE_URL: z.string().optional(),
		MEMORY_TIDY_ENABLED: z.coerce.boolean().default(true),
		MEMORY_TIDY_AT: z.string().default('00:00'),
		MEMORY_TIDY_BATCH_SIZE: z.coerce.number().int().positive().max(200).default(40),
		// YouTube 검색에 사용할 Lavalink REST 주소와 비밀번호 — data-api 서버에서만 사용해요
		LAVALINK_REST_URL: z.string().url().optional(),
		LAVALINK_PASSWORD: z.string().optional(),
		// 소셜 알림(notifier) 프록시 대상 — 기본값은 단일 호스트 개발 구성이에요
		NOTIFIER_URL: z.string().url().default('http://localhost:3004'),
		NOTIFIER_AUTH_KEY: z.string().optional()
	})
	// 폴백 체인(DATA_API_AUTH_KEY ?? AUTH_KEY)을 스키마 안에서 정규화해요.
	.transform((env) => ({
		...env,
		dataApiAuthKey: authKeyChain(env.DATA_API_AUTH_KEY, env.AUTH_KEY),
		notifierAuthKey: authKeyChain(env.NOTIFIER_AUTH_KEY, env.AUTH_KEY)
	}));

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
	return parseEnvOrExit(envSchema);
}
