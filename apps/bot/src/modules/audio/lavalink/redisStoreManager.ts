import { container } from '@sapphire/framework';
import { type RedisClientType, createClient } from '@redis/client';
import { CachedPlayerSaver } from './player/playerSaver.ts';
import { CachedQueueStore } from './queue/queueStore.ts';
import { SapphireInterfaceLogger } from '../../../core/logger.ts';

type RedisClientOptionsType = Parameters<typeof createClient>[0];

export class RedisStoreManager {
	private redis: RedisClientType;
	private queueStore: CachedQueueStore;
	private playerSaver: CachedPlayerSaver;
	private isReady = false;
	private reconnectTryCount = 0;

	constructor(options?: RedisClientOptionsType) {
		this.redis = createClient(options) as RedisClientType;
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

	private get logger() {
		return (container.logger as SapphireInterfaceLogger).getSubLogger({ name: 'redisStoreManager' });
	}

	public getQueueStore() {
		return this.queueStore;
	}

	public getPlayerSaver() {
		return this.playerSaver;
	}

	public async connect() {
		this.redis.connect();
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

		// 재연결 시도 시 연결이 끊어진 것으로 처리
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
