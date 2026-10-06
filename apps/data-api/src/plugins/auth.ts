import type { FastifyInstance } from 'fastify';
import { getLogger } from '../utils/logger.ts';

const logger = getLogger('auth');
// /api/health만 인증 제외. /dashboard도 인증 필요 — 페이지 진입 시 AUTH_KEY 프롬프트로 입력받아
// authorization 헤더로 전송하면 된다. 인증 없이 관제 페이지가 노출되지 않도록 한다.
const excludedPrefixes = ['/api/health'];

export default async function auth(fastify: FastifyInstance): Promise<void> {
	const authKey = process.env.AUTH_KEY;
	if (!authKey) {
		logger.warn('AUTH_KEY is not set, auth will be disabled');
		return;
	}
	logger.info('AUTH_KEY is set, auth will be enabled');
	fastify.addHook('onRequest', async (request, reply) => {
		if (excludedPrefixes.some((prefix) => request.url.startsWith(prefix))) return;
		if (request.headers.authorization !== authKey) {
			return reply.code(401).send({ error: 'Unauthorized' });
		}
	});
}
