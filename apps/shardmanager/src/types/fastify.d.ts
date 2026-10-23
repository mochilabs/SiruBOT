import 'fastify';
import type { ShardManagerServer } from '../server.ts';

declare module 'fastify' {
	interface FastifyInstance {
		manager: ShardManagerServer;
	}
}
