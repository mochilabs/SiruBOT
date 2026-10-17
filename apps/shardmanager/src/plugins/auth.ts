import type { FastifyInstance } from 'fastify';
import { createHash, timingSafeEqual } from 'node:crypto';
import { getLogger } from '../utils/logger.ts';
import type { Env } from '../config/env.ts';

const excludedRoutes = ['/api/health'];

/** 문자열 직접 비교는 타이밍 공격에 노출되므로 sha256으로 길이를 고정한 뒤 timingSafeEqual로 비교해요 */
export function safeEqual(a: string, b: string): boolean {
	const ha = createHash('sha256').update(a).digest();
	const hb = createHash('sha256').update(b).digest();
	return timingSafeEqual(ha, hb);
}

export default async function auth(fastify: FastifyInstance, env: Env) {
	const logger = getLogger('auth');
	const authKey = env.AUTH_KEY;

	if (!authKey) {
		logger.error('AUTH_KEY is not set - refusing to start (fail-closed)');
		process.exit(1);
	}

	logger.info('AUTH_KEY is set, auth will be enabled');

	fastify.addHook('onRequest', async (request, reply) => {
		// 정확한 경로 일치만 인증을 제외해요 — 접두사 매칭은 /api/health/* 아래 미래 라우트를 무인증으로 만들어요.
		const path = request.url.split('?')[0];
		if (excludedRoutes.includes(path)) {
			return;
		}

		const authHeader = request.headers.authorization;
		if (!authHeader || !safeEqual(authHeader, authKey)) {
			return reply.code(401).send({ error: 'Unauthorized' });
		}
	});
}
