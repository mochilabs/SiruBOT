import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';

/**
 * 라우트 레벨 인증 가드 — Authorization 헤더에 키 원문을 받아요 (Bearer 스킴 없음, data-api·storage와 동일).
 * 공개 콜백 라우트와 /health에는 붙이지 않아요 — 보호 라우트에만 preHandler로 적용해요.
 */
export function requireAuth(key: string): preHandlerAsyncHookHandler {
	if (!key) throw new Error('notifier auth key가 비어 있어요 — NOTIFIER_AUTH_KEY 또는 AUTH_KEY를 설정해야 해요.');
	const expected = Buffer.from(key, 'utf8');

	return async function authPreHandler(request: FastifyRequest, reply: FastifyReply) {
		const provided = request.headers.authorization;
		if (typeof provided !== 'string') return reply.code(401).send({ error: '인증 정보가 없어요.' });
		const actual = Buffer.from(provided, 'utf8');
		// 길이가 다르면 timingSafeEqual가 throw하므로 먼저 검사해요.
		if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
			return reply.code(401).send({ error: '인증에 실패했어요.' });
		}
		return undefined;
	};
}
