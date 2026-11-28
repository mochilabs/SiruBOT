import type { FastifyInstance } from 'fastify';

export default async function health(fastify: FastifyInstance): Promise<void> {
	fastify.get('/health', async () => ({ ok: true }));
}
