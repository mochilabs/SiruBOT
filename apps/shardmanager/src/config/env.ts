import { z } from 'zod';
import { parseEnvOrExit } from '@sirubot/app-kit';

const shardCountSchema = z.preprocess(
	(val) => {
		if (val === undefined || val === null || val === '') return 'auto';
		if (val === 'auto') return 'auto';
		const num = Number(val);
		return isNaN(num) ? 'auto' : num;
	},
	z.union([z.literal('auto'), z.number().int().positive()])
);

const envSchema = z.object({
	PORT: z.coerce.number().default(3001),
	HOSTNAME: z.string().optional(),
	DISCORD_TOKEN: z
		.string()
		.min(1)
		.transform((t) => t.trim()),
	DISCORD_WEBHOOK_URL: z.string().url().optional(),
	SHARD_COUNT: shardCountSchema,
	SHARDS_PER_PROCESS: z.coerce.number().int().positive().default(5),
	// 시작 직후 신규 할당 보류 시간(ms). 0이면 끔. 재연결 백오프(최대 30s) 안에 기존 봇이 돌아오게 기본 40s
	ALLOCATION_GRACE_MS: z.coerce.number().int().min(0).default(40_000),
	AUTH_KEY: z.string().optional()
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
	return parseEnvOrExit(envSchema);
}
