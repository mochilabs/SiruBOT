import { afterEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import routes from './[id].ts';

type ShardProcessSummary = { wsId: string; shardIds: number[] };

describe('GET /api/shards/:id', () => {
	const apps: FastifyInstance[] = [];

	afterEach(async () => {
		await Promise.all(apps.splice(0).map((app) => app.close()));
	});

	async function startServer(processes: ShardProcessSummary[]) {
		const app = Fastify();
		app.decorate('manager', {
			getRegistry: () => ({
				getProcessByShardId: (shardId: number) => processes.find((process) => process.shardIds.includes(shardId)) ?? null
			})
		} as never);
		await app.register(routes);
		apps.push(app);
		return app;
	}

	it('returns 400 for a non-numeric shard ID', async () => {
		const app = await startServer([]);
		const response = await app.inject({ method: 'GET', url: '/abc' });
		expect(response.statusCode).toBe(400);
		expect(response.json()).toEqual({ error: 'Invalid shard ID' });
	});

	it('returns 404 for an unassigned shard', async () => {
		const app = await startServer([{ wsId: 'ws-1', shardIds: [0] }]);
		const response = await app.inject({ method: 'GET', url: '/3' });
		expect(response.statusCode).toBe(404);
		expect(response.json()).toEqual({ error: 'Shard 3 not found' });
	});

	it('returns process info for an assigned shard', async () => {
		const app = await startServer([{ wsId: 'ws-1', shardIds: [1] }]);
		const response = await app.inject({ method: 'GET', url: '/1' });
		expect(response.statusCode).toBe(200);
		expect(response.json()).toMatchObject({ wsId: 'ws-1', shardIds: [1] });
	});
});
