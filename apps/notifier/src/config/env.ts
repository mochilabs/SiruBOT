import { z } from 'zod';
import { authKeyChain, parseEnv } from '@sirubot/app-kit';

const envSchema = z
	.object({
		PORT: z.coerce.number().default(3004),
		REDIS_URL: z.string().optional(),
		DATABASE_URL: z.string().optional(),
		NOTIFIER_AUTH_KEY: z.string().optional(),
		AUTH_KEY: z.string().optional(),
		NOTIFIER_PUBLIC_URL: z.string().optional(),
		YOUTUBE_HUB_SECRET: z.string().optional(),
		TWITCH_CLIENT_ID: z.string().optional(),
		TWITCH_CLIENT_SECRET: z.string().optional(),
		TWITCH_EVENTSUB_SECRET: z.string().optional(),
		CHZZK_POLLING_ENABLED: z.string().optional(),
		// 웹훅 토큰 암호화 키. 미설정 시 AUTH_KEY에서 유도하며, AUTH_KEY 회전 시 이전 키를 두면 기존 행이 복호돼요.
		DATA_ENCRYPTION_KEY: z.string().optional()
	})
	.transform((env) => ({
		...env,
		notifierAuthKey: authKeyChain(env.NOTIFIER_AUTH_KEY, env.AUTH_KEY),
		notifierPublicUrl: env.NOTIFIER_PUBLIC_URL?.replace(/\/+$/, ''),
		chzzkPollingEnabled: env.CHZZK_POLLING_ENABLED !== 'false'
	}));

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
	const env = parseEnv(envSchema);
	if (!env.notifierAuthKey) {
		console.error('NOTIFIER_AUTH_KEY 또는 AUTH_KEY 중 하나는 반드시 설정해야 해요.');
		process.exit(1);
	}
	return env;
}
