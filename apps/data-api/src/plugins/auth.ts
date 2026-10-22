import type { FastifyInstance } from 'fastify';
import { createKeyAuthHook } from '@sirubot/app-kit';

// /api/health만 인증 제외. /dashboard도 인증 필요 — 페이지 진입 시 AUTH_KEY 프롬프트로 입력받아
// authorization 헤더로 전송하면 된다. 인증 없이 관제 페이지가 노출되지 않도록 한다.
// 정확한 경로 일치만 허용해요 — 접두사 매칭은 /api/health/* 아래 미래 라우트를 무인증으로 만들어요 (SEC-010).
export default function auth(fastify: FastifyInstance, dataApiAuthKey: string | undefined): Promise<void> {
	return createKeyAuthHook({ key: dataApiAuthKey, appName: 'DataApi', excludePaths: ['/api/health'] })(fastify);
}
