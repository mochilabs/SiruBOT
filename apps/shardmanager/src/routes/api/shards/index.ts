import type { FastifyInstance } from 'fastify';

export default async function routes(fastify: FastifyInstance) {
	fastify.get('/', async () => {
		const registry = fastify.manager.getRegistry();
		return {
			processes: registry.getAllProcesses(),
			stats: registry.getAggregateStats()
		};
	});
}
