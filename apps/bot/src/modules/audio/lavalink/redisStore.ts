import { container } from '@sapphire/framework';
import { createClient, RedisClientType } from '@redis/client';
import { CachedPlayerSaver } from './player/playerSaver.ts';
import { CachedQueueStore } from './queue/queueStore.ts';
import { SapphireInterfaceLogger } from '../../../core/logger.ts';
import { Logger, ILogObj } from 'tslog';

/** Resume timeout과 동일 (5분 = 300초) */
const SESSION_TTL_SECONDS = 60 * 5;

/**
 * Shard 기반 Lavalink node session 저장소.
 * 각 bot replica가 자기 shard에 해당하는 sessionId를 독립적으로 관리합니다.
 *
 * Redis 키 형태: `lavalink/session/{nodeId}/shards:{0,1}`
 */
export class NodeSessionStore {
	private isRedisConnected = true;
	private logger: Logger<ILogObj>;

	constructor(private readonly redis: RedisClientType) {
		this.logger = (container.logger as SapphireInterfaceLogger).getSubLogger({ name: 'nodeSessionStore' });
	}

	/** shard ID 배열로부터 일관된 키 문자열 생성 (정렬) */
	static makeShardKey(shardIds: number[]): string {
		return [...shardIds].sort((a, b) => a - b).join(',');
	}

	private getKey(nodeId: string, shardKey: string): string {
		return `lavalink/session/${nodeId}/shards:${shardKey}`;
	}

	/** 세션 저장 (TTL: resume timeout과 동일하게 5분) */
	public async save(nodeId: string, sessionId: string, shardKey: string): Promise<void> {
		const key = this.getKey(nodeId, shardKey);
		this.logger.debug(`Saving session for node ${nodeId} shards [${shardKey}]: ${sessionId}`);

		try {
			if (this.isRedisConnected) {
				await this.redis.set(key, sessionId, { EX: SESSION_TTL_SECONDS });
				this.logger.trace(`Session saved to Redis: ${key}`);
			}
		} catch (error) {
			this.logger.warn(`Failed to save session to Redis: ${error}`);
			this.isRedisConnected = false;
		}
	}

	/** 세션 조회 */
	public async get(nodeId: string, shardKey: string): Promise<string | null> {
		const key = this.getKey(nodeId, shardKey);

		try {
			if (this.isRedisConnected) {
				const sessionId = await this.redis.get(key);
				this.logger.debug(`Session lookup for ${key}: ${sessionId ?? '(not found)'}`);
				return sessionId;
			}
		} catch (error) {
			this.logger.warn(`Failed to get session from Redis: ${error}`);
			this.isRedisConnected = false;
		}

		return null;
	}

	/** 세션 삭제 */
	public async delete(nodeId: string, shardKey: string): Promise<void> {
		const key = this.getKey(nodeId, shardKey);

		try {
			if (this.isRedisConnected) {
				await this.redis.del(key);
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

export class RedisStore {
	private redis: RedisClientType;
	private queueStore: CachedQueueStore;
	private playerSaver: CachedPlayerSaver;
	private nodeSessionStore: NodeSessionStore;
	private isReady = false;
	private reconnectTryCount = 0;
	private logger: Logger<ILogObj>;

	constructor(options: RedisClientOptionsType) {
		this.redis = createClient(options) as RedisClientType;
		this.logger = (container.logger as SapphireInterfaceLogger).getSubLogger({ name: 'redisStore' });

		this.queueStore = new CachedQueueStore(this.redis);
		this.playerSaver = new CachedPlayerSaver(this.redis);
		this.nodeSessionStore = new NodeSessionStore(this.redis);

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

	/** 범용 문자열 캐시 조회 — 미연결/오류 시 null (호출자가 자체 캐시로 대체) */
	public async getCacheValue(key: string): Promise<string | null> {
		try {
			if (this.isReady) return await this.redis.get(key);
		} catch (error) {
			this.logger.warn(`Cache get failed (${key}): ${error}`);
		}
		return null;
	}

	/** 범용 문자열 캐시 저장 (TTL: 초) */
	public async setCacheValue(key: string, value: string, ttlSeconds: number): Promise<void> {
		try {
			if (this.isReady) await this.redis.set(key, value, { EX: ttlSeconds });
		} catch (error) {
			this.logger.warn(`Cache set failed (${key}): ${error}`);
		}
	}

	/**
	 * SET NX EX — 프로세스 간 동시 작업 방지용 키 선점.
	 * 선점 성공(또는 Redis 미연결이라 보호 불가)이면 true.
	 */
	public async setCacheValueNX(key: string, value: string, ttlSeconds: number): Promise<boolean> {
		try {
			if (this.isReady) return (await this.redis.set(key, value, { EX: ttlSeconds, NX: true })) === 'OK';
			return true;
		} catch (error) {
			this.logger.warn(`Cache setNX failed (${key}): ${error}`);
			return true;
		}
	}

	/**
	 * INCR 카운터 — 첫 증가 시 TTL을 설정해요 (윈도우 종료까지 자동 정리).
	 * 현재 값(증가 후)을 반환하고, Redis 미연결/오류 시 보호 불가로 1을 반환해요.
	 */
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

	/**
	 * 플레이어 상태를 Redis Pub/Sub으로 퍼블리시해요 (채널: `sirubot:player:{guildId}`).
	 * data-api의 playerHub가 구독해 대시보드 라이브 뷰에 서빙해요.
	 * fire-and-forget — Redis 미연결/오류 시 조용히 스킵하고 재생 경로를 절대 블로킹하지 않아요.
	 *
	 * NOTE: incrementCacheCounter(aiChatService)와 마찬가지로 RedisStore 공용 헬퍼예요.
	 * 제어(재생/정지)는 이 퍼블리시로 하지 않아요 — 제어는 bot RPC로 별도 구현 예정이에요.
	 */
	public publishRawPlayerState(guildId: string, payload: string): void {
		try {
			if (!this.isReady) {
				this.logger.debug(`Player state publish skipped (redis not ready, guild ${guildId})`);
				return;
			}
			void this.redis
				.publish(`sirubot:player:${guildId}`, payload)
				.catch((error) => this.logger.debug(`Player state publish failed (guild ${guildId}): ${error}`));
		} catch (error) {
			this.logger.debug(`Player state publish skipped (guild ${guildId}): ${error}`);
		}
	}

	public async connect() {
		await this.redis.connect();
	}

	public async disconnect() {
		if (this.isReady) {
			await this.redis.quit();
		}
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

	private handleReconnecting() {
		this.reconnectTryCount++;
		this.logger.info(`Redis reconnecting (${this.reconnectTryCount})`);

		if (this.isReady) {
			this.isReady = false;
			this.queueStore.onDisconnect();
			this.playerSaver.onDisconnect();
			this.nodeSessionStore.onDisconnect();
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
			this.nodeSessionStore.onDisconnect();
		}
	}

	private handleEnd() {
		this.logger.warn('Redis connection ended');

		if (this.isReady) {
			this.isReady = false;
			this.queueStore.onDisconnect();
			this.playerSaver.onDisconnect();
			this.nodeSessionStore.onDisconnect();
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
