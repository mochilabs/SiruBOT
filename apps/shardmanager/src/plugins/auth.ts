import type { FastifyInstance } from 'fastify';
import { createHash, timingSafeEqual } from 'node:crypto';
import { getLogger } from '../utils/logger.ts';

const excludedRoutes = ['/api/health'];

/** 문자열 직접 비교는 타이밍 공격에 노출되므로 sha256으로 길이를 고정한 뒤 timingSafeEqual로 비교해요 */
export function safeEqual(a: string, b: string): boolean {
	const ha = createHash('sha256').update(a).digest();
	const hb = createHash('sha256').update(b).digest();
	return timingSafeEqual(ha, hb);
}

export default async function auth(fastify: FastifyInstance) {
	const logger = getLogger('auth');
	const authKey = process.env.AUTH_KEY;

	if (!authKey) {
		logger.error('AUTH_KEY is not set - refusing to start (fail-closed)');
		process.exit(1);
	}

	logger.info('AUTH_KEY is set, auth will be enabled');

	fastify.addHook('onRequest', async (request, reply) => {
		if (excludedRoutes.some((route) => request.url.startsWith(route))) {
			return;
		}

		const authHeader = request.headers.authorization;
		if (!authHeader || !safeEqual(authHeader, authKey)) {
			return reply.code(401).send({ error: 'Unauthorized' });
		}
	});
}
