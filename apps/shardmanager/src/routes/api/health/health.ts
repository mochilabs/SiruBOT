import type { FastifyInstance } from 'fastify';

export default async function routes(fastify: FastifyInstance) {
	fastify.get('/', async (_req, _reply) => {
		return { ok: true };
	});
}
