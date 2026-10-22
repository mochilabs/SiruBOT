import { z } from 'zod';

/**
 * 봇 환경 변수 검증 스키마 — 부팅 시 한 번(index.ts) 돌려요.
 *
 * 계약:
 * - 필수 키 누락/공백은 기동 차단(fail-closed) — data-api 등 Fastify 4앱의 parseEnvOrExit과 같은 방향이에요.
 *   (라이브러리 버전은 packages/app-kit/src/env.ts예요. bot에는 app-kit을 도입할 수 없어요 — app-kit이 fastify를
 *   prod deps로 들고 있어서 `yarn workspaces focus @sirubot/bot --production` 이미지에 fastify가 통째로 들어가기
 *   때문이에요. 그래서 safeParse+throw 로직만 로컬로 옮겨 왔고, throw는 진입점(index.ts)의 exit(1)으로 이어져요.)
 * - 값은 여기서 꺼내 쓰지 않아요 — 각 모듈이 process.env에서 그대로 읽어요 (테스트가 런타임에 env를 바꾸는 계약).
 *   이 스키마는 "형식 검증" 전용이에요. 숫자형 tunable의 기본값은 각 소비 모듈의 `Number(env.X) || 기본값`에 있어요.
 */

/** 숫자형 tunable — 빈 문자열/공백은 '미설정'으로, 설정됐으면 숫자여야 해요 (오타는 기동 차단). */
const optionalNumber = z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), z.coerce.number().optional());

/** 로그 레벨 — 봇은 parseInt로 읽으니 숫자를 주로 쓰지만, 이름 설정이 깨지지 않도록 이름도 허용해요. */
const logLevel = z.union([z.coerce.number(), z.enum(['silly', 'trace', 'debug', 'info', 'warn', 'error', 'fatal'])]).optional();

const botEnvSchema = z.object({
	// --- 필수: 없으면 기동 불가. 기존 envParseString/envParseArray/Prisma가 이미 기동 중에 throw하던 키들이에요. ---
	/** Discord 봇 토큰 — client.login()이 envParseString으로 읽어요. */
	DISCORD_TOKEN: z.string().trim().min(1),
	/** 봇 소유자 목록 (공백 구분) — lib/owners.ts가 모듈 로드 시 envParseArray로 읽어요. */
	OWNERS: z.string().trim().min(1),
	/** 라바링크 노드 목록 — bootstrap이 envParseString + parseLavalinkHosts로 읽어요. */
	LAVALINK_HOSTS: z.string().trim().min(1),
	/** 봇 상태 문구 — clientReady 리스너가 envParseArray/envParseString으로 읽어요. */
	BOT_ACTIVITY: z.string().trim().min(1),
	/** Redis — bootstrap의 setupRedis/리스너 start가 envParseString으로 읽어요. */
	REDIS_URL: z.string().trim().min(1),
	/** PostgreSQL — BotApplication.setupDatabase가 PrismaPg에 넘겨요 (없으면 $connect에서 실패). */
	DATABASE_URL: z.string().trim().min(1),
	/** 개발 전용 커맨드 등록 길드 (공백 구분) — development/* 커맨드의 registerApplicationCommands가 envParseArray로 읽어요. */
	DEV_GUILD_IDS: z.string().trim().min(1),

	// --- 선택: 설정되면 형식만 검증해요. ---
	/** 실행 환경 — bootstrap의 isDevMode 판별에 써요. */
	NODE_ENV: z.string().optional(),
	/** 슬래시 커맨드 덮어쓰기 등록 — 'true'일 때만 Overwrite (core/setup.ts). */
	REGISTER_COMMANDS: z.string().optional(),
	/** 프로덕션 샤드매니저 WS 주소 — 미설정이면 dev 모드(단독 실행), 프로덕션에선 bootstrap이 별도로 exit(1). */
	SHARD_MANAGER_URL: z.string().optional(),
	/** 샤드매니저·data-api·Redis 메시지 서명 공유 키. */
	AUTH_KEY: z.string().optional(),
	/** 서비스 간 Redis 메시지 서명 키 — REDIS_AUTH_KEY ?? AUTH_KEY (utils/redisEnvelope). */
	REDIS_AUTH_KEY: z.string().optional(),
	/** Sentry DSN — utils/sentry initSentry가 읽어요 (없으면 비활성). */
	SENTRY_DSN: z.string().optional(),
	/** 라바링크 비밀번호 폴백 — LAVALINK_HOSTS 항목에 비밀번호가 없을 때만 사용해요. */
	LAVALINK_DEFAULT_PASSWORD: z.string().optional(),
	/** data-api(게이트웨이) 주소 — 미설정이면 게이트웨이 기능 비활성 (lib/dataApi.ts). */
	DATA_API_URL: z.string().optional(),
	/** data-api 인증 키 — DATA_API_AUTH_KEY ?? AUTH_KEY 폴백 (lib/dataApi.ts). */
	DATA_API_AUTH_KEY: z.string().optional(),

	// --- AI 채팅/챗 TTS (선택, 미설정이면 기능 off) ---
	CHAT_MODEL: z.string().optional(),
	OPENAI_COMPATIBLE_API_URL: z.string().optional(),
	OPENAI_API_KEY: z.string().optional(),
	LLM_API_TIMEOUT_MS: optionalNumber,
	CHAT_STREAM_UPDATE_MS: optionalNumber,
	ENABLE_THINK_TOKEN: z.string().optional(),
	SIRU_TTS_URL: z.string().optional(),
	SIRU_TTS_API_KEY: z.string().optional(),
	SIRU_TTS_DEFAULT_VOICE: z.string().optional(),

	// --- 숫자형 tunable (선택, 미설정이면 각 소비 모듈의 기본값) ---
	LOGLEVEL: logLevel,
	SHARD_IDENTIFY_RETRY_MS: optionalNumber,
	HEALTH_PORT: optionalNumber,
	JTC_EMPTY_GRACE_MS: optionalNumber,
	MIXER_CALL_TIMEOUT_MS: optionalNumber,
	MIXER_CONFIRM_TIMEOUT_MS: optionalNumber,
	LEAVE_TIMEOUT_MS: optionalNumber,
	MAX_CONSECUTIVE_ERRORS: optionalNumber,
	AUTOPLAY_HIGH_SIM: optionalNumber,
	AUTOPLAY_LOW_SIM: optionalNumber,
	NOTIFIER_DEBOUNCE_MS: optionalNumber,
	NOTIFIER_PROGRESS_TICK_MS: optionalNumber,
	CHAT_CONTEXT_TOKEN_BUDGET: optionalNumber
});

export type BotEnv = z.infer<typeof botEnvSchema>;

export function validateEnv(env: Record<string, string | undefined> = process.env): BotEnv {
	const result = botEnvSchema.safeParse(env);
	if (!result.success) {
		throw new Error(`Invalid environment variables:\n${result.error.message}`);
	}
	return result.data;
}
