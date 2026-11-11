import { z } from 'zod';
import { resolveRedisSigningKey } from '@sirubot/utils/redisEnvelope';

/**
 * 봇 설정 — 환경 변수를 한 번 검증하고, 모든 기본값·클램프·파싱을 이 파일 하나에 모은 타입드 Config예요.
 *
 * 계약:
 * - 필수 키 누락/공백은 기동 차단(fail-closed) — data-api 등 Fastify 4앱의 parseEnvOrExit과 같은 방향이에요.
 *   (라이브러리 버전은 packages/app-kit/src/env.ts예요. bot에는 app-kit을 도입할 수 없어요 — app-kit이 fastify를
 *   prod deps로 들고 있어서 `yarn workspaces focus @sirubot/bot --production` 이미지에 fastify가 통째로 들어가기
 *   때문이에요. 그래서 safeParse+throw 로직만 로컬로 옮겨 왔고, throw는 진입점(index.ts)의 exit(1)으로 이어져요.)
 * - `loadConfig(env)`는 순수 함수예요. zod 스키마는 "형식 검증" 전용이고, 값은 원본 문자열에서 기존 소비 코드와 똑같은
 *   표현식(`Number(x) || 기본값`, `parseInt(x ?? '기본값', 10)` 등)으로 꺼내요. 소비 코드마다 달랐던 기본값·클램프·
 *   truthiness 규칙을 그대로 보존하려는 거라서, 서로 다른 표현식은 일부러 통일하지 않았어요 (각 필드 주석 참고).
 * - 소비 코드는 process.env를 직접 읽지 않아요. 이 파일과 core/environment.ts(.env 로딩)만 process.env를 만져요
 *   (architecture.test.ts가 강제해요).
 */

/** 숫자형 tunable — 빈 문자열/공백은 '미설정'으로, 설정됐으면 숫자여야 해요 (오타는 기동 차단). */
const optionalNumber = z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), z.coerce.number().optional());

/** 로그 레벨 — 봇은 parseInt로 읽으니 숫자를 주로 쓰지만, 이름 설정이 깨지지 않도록 이름도 허용해요. */
const logLevel = z.union([z.coerce.number(), z.enum(['silly', 'trace', 'debug', 'info', 'warn', 'error', 'fatal'])]).optional();

const botEnvSchema = z.object({
	// 필수: 없으면 기동 불가. 예전에도 기동 중에 throw하던 키들이에요.
	/** Discord 봇 토큰 — config.discord.token (client.login). */
	DISCORD_TOKEN: z.string().trim().min(1),
	/** 봇 소유자 목록 (공백 구분) — config.discord.owners (공백 구분 split). */
	OWNERS: z.string().trim().min(1),
	/** 라바링크 노드 목록 — config.lavalink.hosts → parseLavalinkHosts. */
	LAVALINK_HOSTS: z.string().trim().min(1),
	/** 봇 상태 문구 — config.discord.botActivity (clientReady 리스너). */
	BOT_ACTIVITY: z.string().trim().min(1),
	/** Redis — config.redis.url (bootstrap의 setupRedis/리스너 start). */
	REDIS_URL: z.string().trim().min(1),
	/** PostgreSQL — config.database.url — BotApplication.setupDatabase가 PrismaPg에 넘겨요 (없으면 $connect에서 실패). */
	DATABASE_URL: z.string().trim().min(1),
	/** 개발 전용 커맨드 등록 길드 (공백 구분) — config.discord.devGuildIds — development/* 커맨드의 registerApplicationCommands. */
	DEV_GUILD_IDS: z.string().trim().min(1),

	// 선택: 설정되면 형식만 검증해요.
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

	// AI 채팅/챗 TTS (선택, 미설정이면 기능 off)
	CHAT_MODEL: z.string().optional(),
	OPENAI_COMPATIBLE_API_URL: z.string().optional(),
	OPENAI_API_KEY: z.string().optional(),
	LLM_API_TIMEOUT_MS: optionalNumber,
	CHAT_STREAM_UPDATE_MS: optionalNumber,
	ENABLE_THINK_TOKEN: z.string().optional(),
	SIRU_TTS_URL: z.string().optional(),
	SIRU_TTS_DEFAULT_VOICE: z.string().optional(),
	SEARXNG_BASE_URL: z.string().optional(),
	SEARXNG_MAX_RESULTS: optionalNumber,
	ENABLE_SEARXNG: z.string().optional(),

	// 숫자형 tunable (선택, 미설정이면 loadConfig의 기본값)
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

type BotEnv = z.infer<typeof botEnvSchema>;

/** 원본 env(문자열 맵) — process.env도 이 모양이에요. */
export type RawEnv = Record<string, string | undefined>;

/** 형식 검증만 해요. 잘못되면 `Invalid environment variables:` 메시지로 throw → 진입점(index.ts)이 exit(1)해요. */
export function validateEnv(env: RawEnv): BotEnv {
	const result = botEnvSchema.safeParse(env);
	if (!result.success) {
		throw new Error(`Invalid environment variables:\n${result.error.message}`);
	}
	return result.data;
}

export interface Config {
	/** NODE_ENV === 'production' (샤드매니저 모드·로거 위치 표기 판별). setup()이 미설정 NODE_ENV를 'development'로 채우므로 그 외는 전부 dev. */
	readonly isProduction: boolean;
	/**
	 * LOGLEVEL — `parseInt(LOGLEVEL ?? '3', 10)`. 빈 문자열·레벨 이름('debug')은 NaN이 돼요 (기존 동작 그대로).
	 * botClient(로거 minLevel)와 BotApplication.setupDatabase(쿼리 로그 on/off)가 같은 표현식을 써서 한 필드로 합쳤어요.
	 */
	readonly logLevel: number;
	/** REGISTER_COMMANDS === 'true' (정확히 소문자 'true'만, 공백·대소문자 변형은 false) — 슬래시 커맨드 덮어쓰기 등록. */
	readonly registerCommands: boolean;
	readonly discord: {
		/** DISCORD_TOKEN 원본 (trim 안 함 — envParseString과 동일). 절대 로그에 남기지 않아요. */
		readonly token: string;
		/** OWNERS.split(' ') — envParseArray와 동일 (연속 공백이면 빈 항목이 생겨요). */
		readonly owners: readonly string[];
		/** DEV_GUILD_IDS.split(' ') — envParseArray와 동일. */
		readonly devGuildIds: readonly string[];
		/** BOT_ACTIVITY 원본 (쉼표로 구분된 상태 문구 템플릿). */
		readonly botActivity: string;
	};
	readonly lavalink: {
		/** LAVALINK_HOSTS 원본 — parseLavalinkHosts가 파싱해요. */
		readonly hosts: string;
		/** LAVALINK_DEFAULT_PASSWORD 원본, 미설정/빈 값이면 ''. */
		readonly defaultPassword: string;
	};
	readonly redis: {
		readonly url: string;
		/** resolveRedisSigningKey(env) — REDIS_AUTH_KEY ?? AUTH_KEY, trim. 없으면 '' (서명 없는 구버전 모드). */
		readonly signingKey: string;
	};
	readonly database: {
		readonly url: string;
	};
	readonly shard: {
		/** SHARD_MANAGER_URL 원본 — 프로덕션에서 falsy면 exit(1) (core/shardIdentity.ts). */
		readonly managerUrl: string | undefined;
		/**
		 * AUTH_KEY 원본 (trim 안 함) — 샤드매니저 인증용. 프로덕션에서 falsy면 exit(1).
		 * 같은 AUTH_KEY를 dataApi.authKey / redis.signingKey는 trim해서 쓰므로 일부러 별도 필드로 뒀어요.
		 */
		readonly authKey: string | undefined;
		/** Math.max(parseInt(SHARD_IDENTIFY_RETRY_MS ?? '5000', 10), 1000) — 빈 문자열이면 NaN이 돼요 (기존 동작 그대로). */
		readonly identifyRetryMs: number;
	};
	readonly health: {
		/** parseInt(HEALTH_PORT ?? '8080', 10) — 빈 문자열이면 NaN. */
		readonly port: number;
	};
	readonly dataApi: {
		/** DATA_API_URL을 trim하고 끝 슬래시를 잘라낸 값. 미설정/빈 값이면 null → 게이트웨이 기능 off. */
		readonly baseUrl: string | null;
		/** (DATA_API_AUTH_KEY ?? AUTH_KEY ?? '').trim() — DATA_API_AUTH_KEY가 빈 문자열이어도 AUTH_KEY로 폴백하지 않아요 (`??`). */
		readonly authKey: string;
	};
	readonly aiChat: {
		/** OPENAI_COMPATIBLE_API_URL(미설정이면 로컬 기본값)을 trim·끝 슬래시 제거. 빈 값이면 채팅 off. */
		readonly apiUrl: string;
		readonly apiKey: string;
		/** CHAT_MODEL trim. 빈 값이면 채팅 off. */
		readonly model: string;
		/** Math.max(1000, parseInt(LLM_API_TIMEOUT_MS ?? '120000', 10) || 120000) */
		readonly timeoutMs: number;
		/** Math.max(200, parseInt(CHAT_STREAM_UPDATE_MS ?? '450', 10) || 450) */
		readonly streamUpdateMs: number;
		/** (ENABLE_THINK_TOKEN ?? 'false').toLowerCase() === 'true' */
		readonly thinkToken: boolean;
		/** CHAT_CONTEXT_TOKEN_BUDGET — parseInt가 유한하면 [1500, 100000]으로 클램프, 아니면 60000. */
		readonly contextTokenBudget: number;
	};
	readonly tts: {
		/** SIRU_TTS_URL trim·끝 슬래시 제거. 빈 값이면 TTS off. */
		readonly url: string;
		/** SIRU_TTS_DEFAULT_VOICE trim, 빈 값이면 null. */
		readonly defaultVoice: string | null;
	};
	readonly search: {
		/** (ENABLE_SEARXNG ?? 'true').toLowerCase() !== 'false' — trim 안 하므로 ' false'는 켜진 걸로 봐요. */
		readonly searxngEnabled: boolean;
		/** SEARXNG_BASE_URL?.trim() — 미설정이면 undefined, 공백뿐이면 ''. 둘 다 falsy → DuckDuckGo 폴백만 사용. */
		readonly searxngBaseUrl: string | undefined;
	};
	readonly mixer: {
		/** Number(MIXER_CALL_TIMEOUT_MS) || 5000 (0·빈 값·NaN → 기본값, 음수는 그대로) */
		readonly callTimeoutMs: number;
		/** Number(MIXER_CONFIRM_TIMEOUT_MS) || 5000 — 예열 소비 확인 창. */
		readonly confirmTimeoutMs: number;
	};
	readonly autoplay: {
		/** Number(AUTOPLAY_HIGH_SIM) || 0.75 */
		readonly highSimilarity: number;
		/** Number(AUTOPLAY_LOW_SIM) || 0.2 */
		readonly lowSimilarity: number;
	};
	readonly notifier: {
		/** Number(NOTIFIER_DEBOUNCE_MS) || 300 */
		readonly debounceMs: number;
		/** Number(NOTIFIER_PROGRESS_TICK_MS) || 5000 */
		readonly progressTickMs: number;
	};
	readonly playback: {
		/** Number(MAX_CONSECUTIVE_ERRORS) || 3 */
		readonly maxConsecutiveErrors: number;
		/** Number(LEAVE_TIMEOUT_MS) || 300000 — 음성 채널이 비었을 때 퇴장까지의 유예(ms). */
		readonly leaveTimeoutMs: number;
	};
	readonly tempVoice: {
		/** Number(JTC_EMPTY_GRACE_MS) || 30000 — 빈 임시방 삭제 유예(ms). */
		readonly emptyGraceMs: number;
	};
}

/** 검증을 통과한 필수 키의 원본 값 — 스키마가 비어 있지 않음을 이미 보장해서 아래 throw는 도달하지 않아요. */
function requiredRaw(env: RawEnv, key: string): string {
	const value = env[key];
	if (!value) throw new Error(`Invalid environment variables:\n${key} is required`);
	return value;
}

/** `Number(x) || 기본값` — 0·빈 문자열·공백·NaN은 '미설정' 취급, 음수는 그대로 통과해요. */
const numberOr = (raw: string | undefined, fallback: number): number => Number(raw) || fallback;

/** URL 정규화 — trim하고 끝의 슬래시를 잘라내요. */
const trimUrl = (raw: string): string => raw.trim().replace(/\/+$/, '');

/** CHAT_CONTEXT_TOKEN_BUDGET 파싱 — 유한한 정수면 [1500, 100000]으로 클램프, 아니면 기본 60000(64k 윈도우 기준 시스템 프롬프트 예산). */
function parseContextTokenBudget(raw: string | undefined): number {
	const parsed = parseInt(raw ?? '', 10);
	return Number.isFinite(parsed) ? Math.min(100_000, Math.max(1500, parsed)) : 60_000;
}

/** env를 검증하고 Config를 만들어요 (순수 함수 — process.env를 읽지 않아요). 잘못된 env면 throw해요. */
export function loadConfig(env: RawEnv): Config {
	validateEnv(env);

	const ttsDefaultVoice = (env.SIRU_TTS_DEFAULT_VOICE ?? '').trim();

	return Object.freeze({
		isProduction: env.NODE_ENV === 'production',
		logLevel: parseInt(env.LOGLEVEL ?? '3', 10),
		registerCommands: env.REGISTER_COMMANDS === 'true',
		discord: Object.freeze({
			token: requiredRaw(env, 'DISCORD_TOKEN'),
			owners: Object.freeze(requiredRaw(env, 'OWNERS').split(' ')),
			devGuildIds: Object.freeze(requiredRaw(env, 'DEV_GUILD_IDS').split(' ')),
			botActivity: requiredRaw(env, 'BOT_ACTIVITY')
		}),
		lavalink: Object.freeze({
			hosts: requiredRaw(env, 'LAVALINK_HOSTS'),
			defaultPassword: env.LAVALINK_DEFAULT_PASSWORD || ''
		}),
		redis: Object.freeze({
			url: requiredRaw(env, 'REDIS_URL'),
			signingKey: resolveRedisSigningKey(env)
		}),
		database: Object.freeze({
			url: requiredRaw(env, 'DATABASE_URL')
		}),
		shard: Object.freeze({
			managerUrl: env.SHARD_MANAGER_URL,
			authKey: env.AUTH_KEY,
			identifyRetryMs: Math.max(parseInt(env.SHARD_IDENTIFY_RETRY_MS ?? '5000', 10), 1000)
		}),
		health: Object.freeze({
			port: parseInt(env.HEALTH_PORT ?? '8080', 10)
		}),
		dataApi: Object.freeze({
			baseUrl: trimUrl(env.DATA_API_URL ?? '') || null,
			authKey: (env.DATA_API_AUTH_KEY ?? env.AUTH_KEY ?? '').trim()
		}),
		aiChat: Object.freeze({
			apiUrl: trimUrl(env.OPENAI_COMPATIBLE_API_URL ?? 'http://127.0.0.1:8080/v1'),
			apiKey: (env.OPENAI_API_KEY ?? '').trim(),
			model: (env.CHAT_MODEL ?? '').trim(),
			timeoutMs: Math.max(1000, parseInt(env.LLM_API_TIMEOUT_MS ?? '120000', 10) || 120_000),
			// help 커맨드의 타이핑 단계(420~560ms)와 맞춘 기본값 — webhook 편집 제한(5/2초) 여유 내
			streamUpdateMs: Math.max(200, parseInt(env.CHAT_STREAM_UPDATE_MS ?? '450', 10) || 450),
			thinkToken: (env.ENABLE_THINK_TOKEN ?? 'false').toLowerCase() === 'true',
			contextTokenBudget: parseContextTokenBudget(env.CHAT_CONTEXT_TOKEN_BUDGET)
		}),
		tts: Object.freeze({
			url: trimUrl(env.SIRU_TTS_URL ?? ''),
			defaultVoice: ttsDefaultVoice || null
		}),
		search: Object.freeze({
			searxngEnabled: (env.ENABLE_SEARXNG ?? 'true').toLowerCase() !== 'false',
			searxngBaseUrl: env.SEARXNG_BASE_URL?.trim()
		}),
		mixer: Object.freeze({
			callTimeoutMs: numberOr(env.MIXER_CALL_TIMEOUT_MS, 5_000),
			confirmTimeoutMs: numberOr(env.MIXER_CONFIRM_TIMEOUT_MS, 5000)
		}),
		autoplay: Object.freeze({
			highSimilarity: numberOr(env.AUTOPLAY_HIGH_SIM, 0.75),
			lowSimilarity: numberOr(env.AUTOPLAY_LOW_SIM, 0.2)
		}),
		notifier: Object.freeze({
			debounceMs: numberOr(env.NOTIFIER_DEBOUNCE_MS, 300),
			progressTickMs: numberOr(env.NOTIFIER_PROGRESS_TICK_MS, 5000)
		}),
		playback: Object.freeze({
			maxConsecutiveErrors: numberOr(env.MAX_CONSECUTIVE_ERRORS, 3),
			leaveTimeoutMs: numberOr(env.LEAVE_TIMEOUT_MS, 300000)
		}),
		tempVoice: Object.freeze({
			emptyGraceMs: numberOr(env.JTC_EMPTY_GRACE_MS, 30_000)
		})
	});
}

let current: Config | null = null;

/**
 * 현재 Config — 처음 호출될 때 `loadConfig(process.env)`로 한 번 만들어요.
 *
 * 과도기용 전역이에요: 아직 의존성 주입이 안 된 Sapphire 시대 코드(modules/*, services/*, core/*, lib/*)를 위한 접근자예요.
 * - 모듈 최상위(import 시점)에서 부르지 마세요 — `.env`는 core/environment.ts가 로드하므로, 첫 호출은 그 뒤여야 해요.
 *   함수/메서드 안에서 읽거나 지연 getter로 감싸요.
 * - `features/*\/application/` 코드는 getConfig()를 호출하면 안 돼요. 필요한 값은 deps로 받아요 (core/botApplication.ts가 주입).
 */
export function getConfig(): Config {
	current ??= loadConfig(process.env);
	return current;
}

/** 테스트 전용 — Config를 바꿔 끼우고(null이면 초기화해서 다음 getConfig()가 process.env를 다시 읽게 해요). afterEach에서 null로 되돌려요. */
export function setConfigForTesting(config: Config | null): void {
	current = config;
}

/** getConfig()가 이미 Config를 만들었는지 — "import만으로는 Config를 읽지 않는다"는 테스트용이에요. */
export function isConfigLoaded(): boolean {
	return current !== null;
}
