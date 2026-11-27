import { z } from 'zod';
import { resolveRedisSigningKey } from '@sirubot/utils/redisEnvelope';

const optionalNumber = z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), z.coerce.number().optional());

const LOG_LEVEL_BY_NAME = { silly: 0, trace: 1, debug: 2, info: 3, warn: 4, error: 5, fatal: 6 } as const;
type LogLevelName = keyof typeof LOG_LEVEL_BY_NAME;
const LOG_LEVEL_NAMES = Object.keys(LOG_LEVEL_BY_NAME) as [LogLevelName, ...LogLevelName[]];
const DEFAULT_LOG_LEVEL = LOG_LEVEL_BY_NAME.info;

export function shouldLogQueries(logLevel: number): boolean {
	return logLevel <= LOG_LEVEL_BY_NAME.debug;
}

const logLevel = z.preprocess(
	(value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
	z.union([z.coerce.number(), z.enum(LOG_LEVEL_NAMES)]).optional()
);

const botEnvSchema = z.object({
	DISCORD_TOKEN: z.string().trim().min(1),
	OWNERS: z.string().trim().min(1),
	LAVALINK_HOSTS: z.string().trim().min(1),
	BOT_ACTIVITY: z.string().trim().min(1),
	REDIS_URL: z.string().trim().min(1),
	DATABASE_URL: z.string().trim().min(1),
	DEV_GUILD_IDS: z.string().trim().min(1),

	NODE_ENV: z.string().optional(),
	REGISTER_COMMANDS: z.string().optional(),
	SHARD_MANAGER_URL: z.string().optional(),
	AUTH_KEY: z.string().optional(),
	REDIS_AUTH_KEY: z.string().optional(),
	SENTRY_DSN: z.string().optional(),
	LAVALINK_DEFAULT_PASSWORD: z.string().optional(),
	DATA_API_URL: z.string().optional(),
	DASHBOARD_URL: z.string().optional(),
	SUPPORT_SERVER_URL: z.string().optional(),
	DATA_API_AUTH_KEY: z.string().optional(),

	CHAT_MODEL: z.string().optional(),
	OPENAI_COMPATIBLE_API_URL: z.string().optional(),
	OPENAI_API_KEY: z.string().optional(),
	LLM_API_TIMEOUT_MS: optionalNumber,
	CHAT_STREAM_UPDATE_MS: optionalNumber,
	ENABLE_THINK_TOKEN: z.string().optional(),
	SIRU_TTS_URL: z.string().optional(),
	SIRU_TTS_DEFAULT_VOICE: z.string().optional(),
	SIRU_MOJI_URL: z.string().optional(),
	SIRU_MOJI_AUTH_KEY: z.string().optional(),
	SEARXNG_BASE_URL: z.string().optional(),
	ENABLE_SEARXNG: z.string().optional(),

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

export type RawEnv = Record<string, string | undefined>;

export function validateEnv(env: RawEnv): BotEnv {
	const result = botEnvSchema.safeParse(env);
	if (!result.success) {
		throw new Error(`Invalid environment variables:\n${result.error.message}`);
	}
	return result.data;
}

export interface Config {
	readonly isProduction: boolean;
	readonly logLevel: number;
	readonly registerCommands: boolean;
	readonly discord: {
		readonly token: string;
		readonly owners: readonly string[];
		readonly devGuildIds: readonly string[];
		readonly botActivity: string;
	};
	readonly lavalink: {
		readonly hosts: string;
		readonly defaultPassword: string;
	};
	readonly redis: {
		readonly url: string;
		readonly signingKey: string;
	};
	readonly database: {
		readonly url: string;
	};
	readonly shard: {
		readonly managerUrl: string | undefined;
		readonly authKey: string | undefined;
		readonly identifyRetryMs: number;
	};
	readonly health: {
		readonly port: number;
	};
	readonly links: {
		readonly dashboardUrl: string | null;
		readonly supportServerUrl: string | null;
	};
	readonly dataApi: {
		readonly baseUrl: string | null;
		readonly authKey: string;
	};
	readonly aiChat: {
		readonly apiUrl: string;
		readonly apiKey: string;
		readonly model: string;
		readonly timeoutMs: number;
		readonly streamUpdateMs: number;
		readonly thinkToken: boolean;
		readonly contextTokenBudget: number;
	};
	readonly tts: {
		readonly url: string;
		readonly defaultVoice: string | null;
	};
	readonly moji: {
		readonly url: string;
		readonly authKey: string;
	};
	readonly search: {
		readonly searxngEnabled: boolean;
		readonly searxngBaseUrl: string | undefined;
	};
	readonly mixer: {
		readonly callTimeoutMs: number;
		readonly confirmTimeoutMs: number;
	};
	readonly autoplay: {
		readonly highSimilarity: number;
		readonly lowSimilarity: number;
	};
	readonly notifier: {
		readonly debounceMs: number;
		readonly progressTickMs: number;
	};
	readonly playback: {
		readonly maxConsecutiveErrors: number;
		readonly leaveTimeoutMs: number;
	};
	readonly tempVoice: {
		readonly emptyGraceMs: number;
	};
}

function requiredRaw(env: RawEnv, key: string): string {
	const value = env[key];
	if (!value) throw new Error(`Invalid environment variables:\n${key} is required`);
	return value;
}

const numberOr = (raw: string | undefined, fallback: number): number => Number(raw) || fallback;

const trimUrl = (raw: string): string => raw.trim().replace(/\/+$/, '');

const linkUrlOrNull = (raw: string | undefined): string | null => {
	const value = trimUrl(raw ?? '');
	if (!value) return null;
	try {
		const { protocol } = new URL(value);
		return protocol === 'https:' || protocol === 'http:' ? value : null;
	} catch {
		return null;
	}
};

function parseContextTokenBudget(raw: string | undefined): number {
	const parsed = parseInt(raw ?? '', 10);
	return Number.isFinite(parsed) ? Math.min(100_000, Math.max(1500, parsed)) : 60_000;
}

function intOrDefault(raw: string | undefined, fallback: number): number {
	if (raw === undefined || raw.trim() === '') return fallback;
	const parsed = parseInt(raw, 10);
	return Number.isNaN(parsed) ? fallback : parsed;
}

function parseLogLevel(raw: string | undefined): number {
	const value = raw?.trim() ?? '';
	if (value in LOG_LEVEL_BY_NAME) return LOG_LEVEL_BY_NAME[value as LogLevelName];
	return intOrDefault(raw, DEFAULT_LOG_LEVEL);
}

export function loadConfig(env: RawEnv): Config {
	validateEnv(env);

	const ttsDefaultVoice = (env.SIRU_TTS_DEFAULT_VOICE ?? '').trim();

	return Object.freeze({
		isProduction: env.NODE_ENV === 'production',
		logLevel: parseLogLevel(env.LOGLEVEL),
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
			identifyRetryMs: Math.max(intOrDefault(env.SHARD_IDENTIFY_RETRY_MS, 5000), 1000)
		}),
		health: Object.freeze({
			port: intOrDefault(env.HEALTH_PORT, 8080)
		}),
		links: Object.freeze({
			dashboardUrl: linkUrlOrNull(env.DASHBOARD_URL),
			supportServerUrl: linkUrlOrNull(env.SUPPORT_SERVER_URL)
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
		moji: Object.freeze({
			url: trimUrl(env.SIRU_MOJI_URL ?? ''),
			authKey: (env.SIRU_MOJI_AUTH_KEY ?? env.AUTH_KEY ?? '').trim()
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

// 모듈 최상위(import 시점)에서 호출 금지 — .env 로딩 뒤 호출해야 해요
export function getConfig(): Config {
	current ??= loadConfig(process.env);
	return current;
}

export function setConfigForTesting(config: Config | null): void {
	current = config;
}

export function isConfigLoaded(): boolean {
	return current !== null;
}
