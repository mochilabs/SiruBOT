import { z } from 'zod';
import { authKeyChain, parseEnv } from '@sirubot/app-kit';

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
		// ISRC 보강(YouTube 곡 → Deezer·MusicBrainz) — DATABASE_URL이 있을 때만 10분마다 돌아요. 키는 필요 없어요.
		ISRC_ENRICH_ENABLED: z
			.enum(['true', 'false'])
			.default('true')
			.transform((v) => v === 'true'),
		ISRC_ENRICH_BATCH: z.coerce.number().int().positive().max(200).default(25),
		// MusicBrainz 식별용 User-Agent (선택). 개인 연락처를 넣지 마세요.
		MUSICBRAINZ_USER_AGENT: z.string().optional(),
		// YouTube 검색에 사용할 Lavalink REST 주소와 비밀번호 — data-api 서버에서만 사용해요
		LAVALINK_REST_URL: z.string().url().optional(),
		LAVALINK_PASSWORD: z.string().optional(),
		// 소셜 알림(notifier) 프록시 대상 — 기본값은 단일 호스트 개발 구성이에요
		NOTIFIER_URL: z.string().url().default('http://localhost:3004'),
		NOTIFIER_AUTH_KEY: z.string().optional(),
		// 티켓 transcript 같은 비공개 오브젝트를 중계할 storage 주소·키 (봇·대시보드는 이 값을 몰라요)
		STORAGE_URL: z.string().url().default('http://localhost:3003'),
		STORAGE_AUTH_KEY: z.string().optional(),
		// siru_tts 주소 — 대시보드 음성 목록 프록시용. 봇의 SIRU_TTS_URL과 같은 값이에요 (미설정이면 목록 API가 503)
		// 유튜브 자막·챕터 요청이 나가는 경로. 'direct'와 HTTP 프록시 주소를 쉼표로 적어요(앞에 적은 direct가 우선, 프록시끼리는 번갈아 써요)
		OUTBOUND_PROXY_URLS: z.string().default('direct'),
		SIRU_TTS_URL: z.union([z.string().url(), z.literal('').transform(() => undefined)]).optional()
	})
	// 폴백 체인(DATA_API_AUTH_KEY ?? AUTH_KEY)을 스키마 안에서 정규화해요.
	.transform((env) => ({
		...env,
		dataApiAuthKey: authKeyChain(env.DATA_API_AUTH_KEY, env.AUTH_KEY),
		notifierAuthKey: authKeyChain(env.NOTIFIER_AUTH_KEY, env.AUTH_KEY),
		storageAuthKey: authKeyChain(env.STORAGE_AUTH_KEY, env.AUTH_KEY)
	}));

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
	return parseEnv(envSchema);
}
