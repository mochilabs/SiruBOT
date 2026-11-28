import { playerStateChannel } from '@sirubot/utils';
import { createClient, RedisClientType } from '@redis/client';
import type { LavalinkManager } from 'lavalink-client';
import { CachedPlayerSaver } from './player/playerSaver.ts';
import { CachedQueueStore } from './queue/queueStore.ts';
import type { CustomPlayer } from './player/customPlayer.ts';
import type { LavalinkLogger } from './deps.ts';
import { Logger, ILogObj } from 'tslog';

/** Must match sessionRestore.RESUME_TIMEOUT_SECONDS (kept as a literal to avoid a circular import). */
const SESSION_TTL_SECONDS = 60;

export class NodeSessionStore {
	private isRedisConnected = true;
	private logger: Logger<ILogObj>;

	constructor(
		private readonly redis: RedisClientType,
		logger: LavalinkLogger
	) {
		this.logger = logger.getSubLogger({ name: 'nodeSessionStore' });
	}

	static makeShardKey(shardIds: number[]): string {
		return [...shardIds].sort((a, b) => a - b).join(',');
	}

	private getKey(nodeId: string, shardKey: string): string {
		return `lavalink/session/${nodeId}/shards:${shardKey}`;
	}

	public async save(nodeId: string, sessionId: string, shardKey: string): Promise<boolean> {
		const key = this.getKey(nodeId, shardKey);
		this.logger.debug(`Saving session for node ${nodeId} shards [${shardKey}]: ${sessionId}`);

		if (!this.isRedisConnected && !this.redis.isReady) return false;
		try {
			await this.redis.set(key, sessionId, { EX: SESSION_TTL_SECONDS });
			this.isRedisConnected = true;
			this.logger.trace(`Session saved to Redis: ${key}`);
			return true;
		} catch (error) {
			this.logger.warn(`Failed to save session to Redis: ${error}`);
			this.isRedisConnected = false;
			return false;
		}
	}

	public async get(nodeId: string, shardKey: string): Promise<string | null> {
		const key = this.getKey(nodeId, shardKey);

		try {
			if (this.isRedisConnected || this.redis.isReady) {
				const sessionId = await this.redis.get(key);
				this.isRedisConnected = true;
				this.logger.debug(`Session lookup for ${key}: ${sessionId ?? '(not found)'}`);
				return sessionId;
			}
		} catch (error) {
			this.logger.warn(`Failed to get session from Redis: ${error}`);
			this.isRedisConnected = false;
		}

		return null;
	}

	public async delete(nodeId: string, shardKey: string): Promise<void> {
		const key = this.getKey(nodeId, shardKey);

		try {
			if (this.isRedisConnected || this.redis.isReady) {
				await this.redis.del(key);
				this.isRedisConnected = true;
				this.logger.trace(`Session deleted: ${key}`);
			}
		} catch (error) {
			this.logger.warn(`Failed to delete session from Redis: ${error}`);
			this.isRedisConnected = false;
		}
	}

	public onConnect(): void {
		this.isRedisConnected = true;
	}

	public onDisconnect(): void {
		this.isRedisConnected = false;
	}
}

type RedisClientOptionsType = Parameters<typeof createClient>[0];

export interface RedisStoreDeps {
	logger: LavalinkLogger;
	getAudio: () => LavalinkManager<CustomPlayer> | undefined;
}

export class RedisStore {
	private redis: RedisClientType;
	private queueStore: CachedQueueStore;
	private playerSaver: CachedPlayerSaver;
	private nodeSessionStore: NodeSessionStore;
	private isReady = false;
	private reconnectTryCount = 0;
	private logger: Logger<ILogObj>;

	constructor(options: RedisClientOptionsType, deps: RedisStoreDeps) {
		this.redis = createClient(options) as RedisClientType;
		this.logger = deps.logger.getSubLogger({ name: 'redisStore' });

		this.queueStore = new CachedQueueStore(this.redis, { logger: deps.logger, getAudio: deps.getAudio });
		this.playerSaver = new CachedPlayerSaver(this.redis, deps.logger);
		this.nodeSessionStore = new NodeSessionStore(this.redis, deps.logger);

		this.redis.on('error', this.handleError.bind(this));
		this.redis.on('connect', this.handleConnect.bind(this));
		this.redis.on('reconnecting', this.handleReconnecting.bind(this));
		this.redis.on('ready', this.handleReady.bind(this));
		this.redis.on('end', this.handleEnd.bind(this));

		this.queueStore.onDisconnect();
		this.playerSaver.onDisconnect();
		this.nodeSessionStore.onDisconnect();
	}

	public getQueueStore() {
		return this.queueStore;
	}

	public getPlayerSaver() {
		return this.playerSaver;
	}

	public getNodeSessionStore() {
		return this.nodeSessionStore;
	}

	public async getCacheValue(key: string): Promise<string | null> {
		try {
			if (this.isReady) return await this.redis.get(key);
		} catch (error) {
			this.logger.warn(`Cache get failed (${key}): ${error}`);
		}
		return null;
	}

	public async setCacheValue(key: string, value: string, ttlSeconds: number): Promise<void> {
		try {
			if (this.isReady) await this.redis.set(key, value, { EX: ttlSeconds });
		} catch (error) {
			this.logger.warn(`Cache set failed (${key}): ${error}`);
		}
	}

	public async deleteCacheValue(key: string): Promise<void> {
		try {
			if (this.isReady) await this.redis.del(key);
		} catch (error) {
			this.logger.warn(`Cache delete failed (${key}): ${error}`);
		}
	}

	public async setCacheValueNX(key: string, value: string, ttlSeconds: number): Promise<boolean> {
		try {
			if (this.isReady) return (await this.redis.set(key, value, { EX: ttlSeconds, NX: true })) === 'OK';
			return true;
		} catch (error) {
			this.logger.warn(`Cache setNX failed (${key}): ${error}`);
			return true;
		}
	}

	public async incrementCacheCounter(key: string, windowTtlSeconds: number): Promise<number> {
		try {
			if (!this.isReady) return 1;
			const value = await this.redis.incr(key);
			if (value === 1) await this.redis.expire(key, windowTtlSeconds);
			return value;
		} catch (error) {
			this.logger.warn(`Cache incr failed (${key}): ${error}`);
			return 1;
		}
	}

	public async addToSetAndCount(key: string, members: string[], ttlSeconds: number): Promise<number | null> {
		try {
			if (!this.isReady) return null;
			const multi = this.redis.multi();
			if (members.length > 0) multi.sAdd(key, members);
			const replies = await multi.expire(key, ttlSeconds).sCard(key).exec();
			const size = Number(replies[replies.length - 1]);
			return Number.isFinite(size) ? size : null;
		} catch (error) {
			this.logger.warn(`Cache set add failed (${key}): ${error}`);
			return null;
		}
	}

	public async getCacheHashFields(key: string): Promise<Record<string, string> | null> {
		try {
			if (this.isReady) return await this.redis.hGetAll(key);
		} catch (error) {
			this.logger.warn(`Cache hGetAll failed (${key}): ${error}`);
		}
		return null;
	}

	public async setCacheHashFields(key: string, fields: Record<string, string>): Promise<void> {
		try {
			if (this.isReady && Object.keys(fields).length > 0) await this.redis.hSet(key, fields);
		} catch (error) {
			this.logger.warn(`Cache hSet failed (${key}): ${error}`);
		}
	}

	public async deleteCacheHashField(key: string, field: string): Promise<void> {
		try {
			if (this.isReady) await this.redis.hDel(key, field);
		} catch (error) {
			this.logger.warn(`Cache hDel failed (${key}): ${error}`);
		}
	}

	public publish(channel: string, payload: string, label: string): void {
		try {
			if (!this.isReady) {
				this.logger.debug(`${label} publish skipped (redis not ready)`);
				return;
			}
			void this.redis.publish(channel, payload).catch((error) => this.logger.debug(`${label} publish failed: ${error}`));
		} catch (error) {
			this.logger.debug(`${label} publish skipped: ${error}`);
		}
	}

	public publishRawPlayerState(guildId: string, payload: string): void {
		this.publish(playerStateChannel(guildId), payload, `Player state (guild ${guildId})`);
	}

	public async connect() {
		await this.redis.connect();
	}

	public async disconnect() {
		// Destroy the socket even if not ready; otherwise node-redis's reconnect loop keeps the process alive.
		if (!this.redis.isOpen) return;
		if (!this.redis.isReady) {
			this.redis.destroy();
			return;
		}
		try {
			await this.redis.quit();
		} catch (error) {
			this.logger.warn(`Redis quit failed during shutdown, destroying the socket: ${error}`);
			this.redis.destroy();
		}
	}

	public async flushPendingWrites(): Promise<void> {
		await Promise.allSettled([this.queueStore.drainPendingWrites(), this.playerSaver.drainPendingWrites()]);
	}

	public get ready() {
		return this.isReady;
	}

	private handleConnect() {
		this.logger.info('Redis connected');

		this.queueStore.onConnect();
		this.playerSaver.onConnect();
		this.nodeSessionStore.onConnect();
	}

	private markDisconnected(): void {
		if (!this.isReady) return;
		this.isReady = false;
		this.queueStore.onDisconnect();
		this.playerSaver.onDisconnect();
		this.nodeSessionStore.onDisconnect();
	}

	private handleReconnecting() {
		this.reconnectTryCount++;
		this.logger.info(`Redis reconnecting (${this.reconnectTryCount})`);
		this.markDisconnected();
	}

	private handleReady() {
		const wasReady = this.isReady;
		this.isReady = true;
		this.logger.info('Redis ready!');
		this.reconnectTryCount = 0;
		if (!wasReady) {
			this.nodeSessionStore.onConnect();
		}
	}

	private handleError(err: Error) {
		this.logger.error(`Redis Error: ${err}`);
		this.markDisconnected();
	}

	private handleEnd() {
		this.logger.warn('Redis connection ended');
		this.markDisconnected();
	}
}
