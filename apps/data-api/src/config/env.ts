import { z } from 'zod';
import { authKeyChain, parseEnv } from '@sirubot/app-kit';

const envSchema = z
	.object({
		PORT: z.coerce.number().default(3002),
		REDIS_URL: z.string().optional(),
		DATA_API_AUTH_KEY: z.string().optional(),
		AUTH_KEY: z.string().optional(),
		OPENAI_COMPATIBLE_API_URL: z.string().default('http://127.0.0.1:8080/v1'),
		OPENAI_API_KEY: z.string().optional(),
		TRANSLATION_MODEL: z.string().default('default'),
		CUSTOM_COMMAND_DRAFT_MODEL: z.string().optional(),
		OHAASA_REFRESH_AT: z.string().default('06:50'),
		DATABASE_URL: z.string().optional(),
		MEMORY_TIDY_ENABLED: z.coerce.boolean().default(true),
		MEMORY_TIDY_AT: z.string().default('00:00'),
		MEMORY_TIDY_BATCH_SIZE: z.coerce.number().int().positive().max(200).default(40),
		ISRC_ENRICH_ENABLED: z
			.enum(['true', 'false'])
			.default('true')
			.transform((v) => v === 'true'),
		ISRC_ENRICH_BATCH: z.coerce.number().int().positive().max(200).default(25),
		MUSICBRAINZ_USER_AGENT: z.string().optional(),
		LAVALINK_REST_URL: z.string().url().optional(),
		LAVALINK_PASSWORD: z.string().optional(),
		NOTIFIER_URL: z.string().url().default('http://localhost:3004'),
		NOTIFIER_AUTH_KEY: z.string().optional(),
		STORAGE_URL: z.string().url().default('http://localhost:3003'),
		STORAGE_AUTH_KEY: z.string().optional(),
		OUTBOUND_PROXY_URLS: z.string().default('direct'),
		SIRU_TTS_URL: z.union([z.string().url(), z.literal('').transform(() => undefined)]).optional()
	})
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
