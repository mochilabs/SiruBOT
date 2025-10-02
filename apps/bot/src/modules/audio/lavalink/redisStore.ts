import { container } from '@sapphire/framework';
import { createClient, RedisClientType } from '@redis/client';
import { CachedPlayerSaver } from './player/playerSaver.ts';
import { CachedQueueStore } from './queue/queueStore.ts';
import { SapphireInterfaceLogger } from '../../../core/logger.ts';
import { Logger, ILogObj } from 'tslog';

type RedisClientOptionsType = Parameters<typeof createClient>[0];

export class RedisStore {
	private redis: RedisClientType;
	private queueStore: CachedQueueStore;
	private playerSaver: CachedPlayerSaver;
	private isReady = false;
	private reconnectTryCount = 0;
	private logger: Logger<ILogObj>;

	constructor(options: RedisClientOptionsType) {
		this.redis = createClient(options) as RedisClientType;
		this.logger = (container.logger as SapphireInterfaceLogger).getSubLogger({ name: 'redisStore' });

		this.queueStore = new CachedQueueStore(this.redis);
		this.playerSaver = new CachedPlayerSaver(this.redis);

		this.redis.on('error', this.handleError.bind(this));
		this.redis.on('connect', this.handleConnect.bind(this));
		this.redis.on('reconnecting', this.handleReconnecting.bind(this));
		this.redis.on('ready', this.handleReady.bind(this));
		this.redis.on('end', this.handleEnd.bind(this));

		this.queueStore.onDisconnect();
		this.playerSaver.onDisconnect();
	}

	public getQueueStore() {
		return this.queueStore;
	}

	public getPlayerSaver() {
		return this.playerSaver;
	}

	public async connect() {
		await this.redis.connect();
	}

	public get ready() {
		return this.isReady;
	}

	private handleConnect() {
		this.logger.info('Redis connected');

		this.queueStore.onConnect();
		this.playerSaver.onConnect();
	}

	private handleReconnecting() {
		this.reconnectTryCount++;
		this.logger.info(`Redis reconnecting (${this.reconnectTryCount})`);

		if (this.isReady) {
			this.isReady = false;
			this.queueStore.onDisconnect();
			this.playerSaver.onDisconnect();
		}
	}

	private handleReady() {
		this.isReady = true;
		this.logger.info('Redis ready!');
		this.reconnectTryCount = 0;
	}

	private handleError(err: Error) {
		this.logger.error(`Redis Error: ${err}`);

		if (this.isReady) {
			this.isReady = false;
			this.queueStore.onDisconnect();
			this.playerSaver.onDisconnect();
		}
	}

	private handleEnd() {
		this.logger.warn('Redis connection ended');

		if (this.isReady) {
			this.isReady = false;
			this.queueStore.onDisconnect();
			this.playerSaver.onDisconnect();
		}
	}

	public getCacheStats() {
		return {
			queueStore: this.queueStore.getCacheStats(),
			playerSaver: this.playerSaver.getCacheStats()
		};
	}

	public cleanupCache(): { queueStore: number; playerSaver: number } {
		return {
			queueStore: this.queueStore.cleanupCache(),
			playerSaver: this.playerSaver.cleanupCache()
		};
	}
}
