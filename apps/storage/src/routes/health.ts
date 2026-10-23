import type { FastifyInstance } from 'fastify';

/** 헬스체크: 인증 없이 응답해요 */
export default async function health(fastify: FastifyInstance): Promise<void> {
	fastify.get('/health', async () => ({ ok: true }));
}
