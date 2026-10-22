import Fastify, { FastifyInstance } from 'fastify';
import path from 'path';
import AutoLoad from '@fastify/autoload';
import WebSocket from '@fastify/websocket';
import { registerAppErrorHandler } from '@sirubot/app-kit';
import { captureSentryException } from '@sirubot/utils/sentry';
import { getLogger } from './utils/logger.ts';
import auth from './plugins/auth.ts';
import { ShardRegistry } from './core/shardRegistry.ts';
import { DiscordNotifier } from './utils/discordNotifier.ts';
import type { Env } from './config/env.ts';

export class ShardManagerServer {
	private fastify: FastifyInstance;
	private logger: ReturnType<typeof getLogger>;
	private env: Env;
	private port: number;
	private shardCount: number;
	private shardsPerProcess: number;
	private registry: ShardRegistry;
	private notifier: DiscordNotifier;

	constructor(shardCount: number, shardsPerProcess: number, env: Env) {
		this.fastify = Fastify({ logger: false });
		this.logger = getLogger('server');
		this.env = env;
		this.port = env.PORT;
		this.shardCount = shardCount;
		this.shardsPerProcess = shardsPerProcess;
		this.notifier = new DiscordNotifier(env.DISCORD_WEBHOOK_URL);
		this.registry = new ShardRegistry(shardCount, shardsPerProcess, this.notifier);
	}

	public async setupRoutes() {
		// Global error handler — 공용 { error: 코드, message: 한국어 } 계약으로 통일해요.
		// (기존 로컬 핸들러는 error: 'Internal Server Error' + statusCode만 내려서 영문·shape 이질적이었어요.)
		registerAppErrorHandler(this.fastify, { logger: this.logger, onServerError: captureSentryException });

		await auth(this.fastify, this.env);
		// 명시적 제네릭 — decorate의 조건부 오버로드 추론이 클래스 인스턴스에서 함수 타입으로 잘못 잡혀요(as any 캐스트 불필요).
		this.fastify.decorate<ShardManagerServer, 'manager'>('manager', this);
		// maxPayload — 기본값 100MiB 프레임은 인증된 클라이언트가 메모리로 죽일 수 있어요(SEC-004).
		// 실제 메시지는 작은 JSON(식별·하트비트·상태)뿐이라 64KiB면 충분해요.
		await this.fastify.register(WebSocket, { options: { maxPayload: 64 * 1024 } });
		await this.fastify.register(AutoLoad, {
			dir: path.join(import.meta.dirname, 'routes'),
			dirNameRoutePrefix: true,
			forceESM: true
		});
	}

	public async start() {
		try {
			const host = this.env.HOSTNAME || 'localhost';
			await this.fastify.listen({ port: this.port, host });
			this.logger.info(`Shard Manager started`);
			this.logger.info(`- Local:     http://localhost:${this.port}`);
			if (host !== 'localhost') {
				this.logger.info(`- Network:   http://${host}:${this.port}`);
			}
			this.logger.info(`- WebSocket: ws://${host}:${this.port}/ws`);
			this.logger.info(`- Shards: ${this.shardCount}, per process: ${this.shardsPerProcess}`);
		} catch (error) {
			this.logger.error(error);
			process.exit(1);
		}
	}

	public async stop() {
		try {
			this.registry.destroy();
			await this.fastify.close();
			this.logger.info('Server stopped gracefully');
		} catch (error) {
			this.logger.error(error);
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

	public getAuthKey(): string | undefined {
		return this.env.AUTH_KEY;
	}
}
