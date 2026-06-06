import Fastify, { FastifyInstance } from 'fastify';
import path from 'path';
import AutoLoad from '@fastify/autoload';
import WebSocket from '@fastify/websocket';
import { getLogger } from './utils/logger.ts';
import auth from './plugins/auth.ts';
import { ShardRegistry } from './core/shardRegistry.ts';
import { DiscordNotifier } from './utils/discordNotifier.ts';

export class ShardManagerServer {
	private fastify: FastifyInstance;
	private logger: ReturnType<typeof getLogger>;
	private port: number = parseInt(process.env.PORT || '3001');
	private shardCount: number;
	private shardsPerProcess: number;
	private registry: ShardRegistry;
	private notifier: DiscordNotifier;

	constructor(shardCount: number, shardsPerProcess: number = 5, webhookUrl?: string) {
		this.fastify = Fastify({ logger: false });
		this.logger = getLogger('server');
		this.shardCount = shardCount;
		this.shardsPerProcess = shardsPerProcess;
		this.notifier = new DiscordNotifier(webhookUrl);
		this.registry = new ShardRegistry(shardCount, shardsPerProcess, this.notifier);
	}

	public async setupRoutes() {
		// Global error handler
		this.fastify.setErrorHandler((error: { message: string; statusCode?: number }, request, reply) => {
			this.logger.error('system.server.request_error', { error, url: request.url, method: request.method });
			reply.status(error.statusCode ?? 500).send({
				error: error.message,
				statusCode: error.statusCode ?? 500
			});
		});

		await auth(this.fastify);
		this.fastify.decorate('manager', this as any);
		await this.fastify.register(WebSocket);
		await this.fastify.register(AutoLoad, {
			dir: path.join(import.meta.dirname, 'routes'),
			dirNameRoutePrefix: true,
			forceESM: true
		});
	}

	public async start() {
		try {
			const host = process.env.HOSTNAME || 'localhost';
			await this.fastify.listen({ port: this.port, host });
			this.logger.info('system.server.started');
			this.logger.info('system.server.address', { local: `http://localhost:${this.port}` });
			if (host !== 'localhost') {
				this.logger.info('system.server.address', { network: `http://${host}:${this.port}` });
			}
			this.logger.info('system.server.address', { websocket: `ws://${host}:${this.port}/ws` });
			this.logger.info('system.server.info', { shardCount: this.shardCount, shardsPerProcess: this.shardsPerProcess });
		} catch (error) {
			this.logger.error('system.server.error', error);
			process.exit(1);
		}
	}

	public async stop() {
		try {
			this.registry.destroy();
			await this.fastify.close();
			this.logger.info('system.server.stopped');
		} catch (error) {
			this.logger.error('system.server.error', error);
		}
	}

	public getShardCount() {
		return this.shardCount;
	}

	public getRegistry() {
		return this.registry;
	}

	public getNotifier() {
		return this.notifier;
	}
}
