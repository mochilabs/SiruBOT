import { z } from 'zod';

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
	DISCORD_TOKEN: z
		.string()
		.min(1)
		.transform((t) => t.trim()),
	DISCORD_WEBHOOK_URL: z.string().url().optional(),
	SHARD_COUNT: shardCountSchema,
	SHARDS_PER_PROCESS: z.coerce.number().int().positive().default(5),
	LOGLEVEL: z.string().default('info'),
	AUTH_KEY: z.string().optional(),
	NODE_ENV: z.enum(['development', 'production']).default('development')
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
	console.log('Loading environment variables...');
	console.log('Current process.env keys:', Object.keys(process.env).join(', '));
	console.log('Specific Env Check:', {
		PORT: process.env.PORT,
		SHARD_COUNT: process.env.SHARD_COUNT,
		LOGLEVEL: process.env.LOGLEVEL,
		SHARD_MANAGER_URL: process.env.SHARD_MANAGER_URL,
		// Mask token
		DISCORD_TOKEN: process.env.DISCORD_TOKEN
	});

	const result = envSchema.safeParse(process.env);

	if (!result.success) {
		console.error('❌ Invalid environment variables:');
		console.error(result.error.format());
		process.exit(1);
	}

	return result.data;
}
