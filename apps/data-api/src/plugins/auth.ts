import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { getLogger } from '../utils/logger.ts';

const logger = getLogger('auth');
// /api/health만 인증 제외. /dashboard도 인증 필요 — 페이지 진입 시 AUTH_KEY 프롬프트로 입력받아
// authorization 헤더로 전송하면 된다. 인증 없이 관제 페이지가 노출되지 않도록 한다.
const excludedPrefixes = ['/api/health'];

// 문자열 직접 비교는 타이밍 공격에 노출되므로 sha256 다이제스트를 timingSafeEqual로 비교해요.
function safeEqual(a: string, b: string): boolean {
	const da = createHash('sha256').update(a, 'utf8').digest();
	const db = createHash('sha256').update(b, 'utf8').digest();
	return timingSafeEqual(da, db);
}

export default async function auth(fastify: FastifyInstance): Promise<void> {
	// data-api는 자체 키(DATA_API_AUTH_KEY)를 우선 사용하고, 없으면 봇과 공유하는 AUTH_KEY로 폴백해요.
	// 키가 없으면 auth 비활성화 대신 fail-closed — 기동 자체를 거절해요.
	const dataApiAuthKey = process.env.DATA_API_AUTH_KEY ?? process.env.AUTH_KEY;
	if (!dataApiAuthKey) {
		logger.error('AUTH_KEY is not set - refusing to start (fail-closed)');
		process.exit(1);
	}
	logger.info('AUTH_KEY is set, auth will be enabled');
	fastify.addHook('onRequest', async (request, reply) => {
		if (excludedPrefixes.some((prefix) => request.url.startsWith(prefix))) return;
		const header = request.headers.authorization;
		if (typeof header !== 'string' || !safeEqual(header, dataApiAuthKey)) {
			return reply.code(401).send({ error: 'Unauthorized' });
		}
	});
}
