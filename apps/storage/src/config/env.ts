import { z } from 'zod';
import { authKeyChain, parseEnv } from '@sirubot/app-kit';

const envSchema = z
	.object({
		PORT: z.coerce.number().default(3003),
		STORAGE_DATA_DIR: z.string().default('./data'),
		// 디스코드가 임베드 이미지를 가져가는 주소라 https 공개 도메인이어야 해요.
		STORAGE_PUBLIC_URL: z.string().url(),
		STORAGE_AUTH_KEY: z.string().optional(),
		AUTH_KEY: z.string().optional()
	})
	.transform((env) => ({ ...env, storageAuthKey: authKeyChain(env.STORAGE_AUTH_KEY, env.AUTH_KEY) }));

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
	const env = parseEnv(envSchema);
	if (!env.storageAuthKey) {
		console.error('STORAGE_AUTH_KEY 또는 AUTH_KEY 중 하나는 반드시 설정해야 해요.');
		process.exit(1);
	}
	return env;
}
