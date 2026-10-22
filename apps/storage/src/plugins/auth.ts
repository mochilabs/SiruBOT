import type { preHandlerAsyncHookHandler } from 'fastify';
import { createKeyPreHandler } from '@sirubot/app-kit';

/**
 * 라우트 레벨 인증 가드 — Authorization 헤더에 키 원문을 받아요 (Bearer 스킴 없음, data-api와 동일).
 * 공개 오브젝트 GET과 /health에는 붙이지 않아요 — 보호 라우트에만 preHandler로 적용해요.
 */
export function requireAuth(key: string): preHandlerAsyncHookHandler {
	return createKeyPreHandler({ key, appName: 'storage' });
}
