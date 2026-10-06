import { z } from 'zod';

export const isDev = process.env.NODE_ENV !== 'production';

/**
 * zod 기반 통합 env 파서.
 * data-api / shardmanager의 config/env.ts에 흩어진 zod 검증을 이 공용 헬퍼로 통일하기 위한 것으로,
 * 각 앱은 자신의 스키마를 정의해 이 함수로 검증하면 된다.
 * (기존 호출부 마이그레이션은 별도 작업 — 이 파일은 신규 공용 API만 제공한다)
 */
export function parseEnv<S extends z.ZodTypeAny>(schema: S, source: NodeJS.ProcessEnv = process.env): z.infer<S> {
	const result = schema.safeParse(source);
	if (!result.success) {
		const details = result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ');
		throw new Error(`[env] 환경변수 검증 실패: ${details}`);
	}
	return result.data;
}

/** 공용 env 조각 — 각 앱 스키마에 `{ ...baseEnvSchema.shape }` 형태로 합쳐 쓴다 */
export const baseEnvSchema = z.object({
	NODE_ENV: z.enum(['development', 'production', 'test']).default('development')
});
