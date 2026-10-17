import { z } from 'zod';

const envSchema = z
	.object({
		PORT: z.coerce.number().default(3003),
		// 저장 루트 디렉토리 (Docker에선 /data 볼륨 마운트)
		STORAGE_DATA_DIR: z.string().default('./data'),
		// 공개 GET URL의 베이스 — 디스코드가 임베드로 fetch하는 주소예요 (반드시 https 공개 도메인)
		STORAGE_PUBLIC_URL: z.string().url(),
		// 자체 키를 우선 쓰고, 없으면 봇과 공유하는 AUTH_KEY로 폴백해요 (data-api와 같은 계약)
		STORAGE_AUTH_KEY: z.string().optional(),
		AUTH_KEY: z.string().optional()
	})
	.transform((env) => ({ ...env, storageAuthKey: env.STORAGE_AUTH_KEY ?? env.AUTH_KEY }));

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
	const result = envSchema.safeParse(process.env);
	if (!result.success) {
		console.error('❌ Invalid environment variables:');
		console.error(result.error.format());
		process.exit(1);
	}
	// 키가 없으면 fail-closed — 인증 없는 스토리지로 기동하지 않아요.
	if (!result.data.storageAuthKey) {
		console.error('❌ STORAGE_AUTH_KEY 또는 AUTH_KEY 중 하나는 반드시 설정해야 해요.');
		process.exit(1);
	}
	return result.data;
}
