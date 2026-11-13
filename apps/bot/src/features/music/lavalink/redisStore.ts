import { playerStateChannel } from '@sirubot/utils';
import { createClient, RedisClientType } from '@redis/client';
import type { LavalinkManager } from 'lavalink-client';
import { CachedPlayerSaver } from './player/playerSaver.ts';
import { CachedQueueStore } from './queue/queueStore.ts';
import type { CustomPlayer } from './player/customPlayer.ts';
import type { LavalinkLogger } from './deps.ts';
import { Logger, ILogObj } from 'tslog';

/** Resume timeout과 동일 (sessionRestore의 RESUME_TIMEOUT_SECONDS=60 — 순환 import를 피해 리터럴로 둠) */
const SESSION_TTL_SECONDS = 60;

/**
 * Shard 기반 Lavalink node session 저장소.
 * 각 bot replica가 자기 shard에 해당하는 sessionId를 독립적으로 관리합니다.
 *
 * Redis 키 형태: `lavalink/session/{nodeId}/shards:{0,1}`
 */
export class NodeSessionStore {
	private isRedisConnected = true;
	private logger: Logger<ILogObj>;

	constructor(
		private readonly redis: RedisClientType,
		logger: LavalinkLogger
	) {
		this.logger = logger.getSubLogger({ name: 'nodeSessionStore' });
	}

	/** shard ID 배열로부터 일관된 키 문자열 생성 (정렬) */
	static makeShardKey(shardIds: number[]): string {
		return [...shardIds].sort((a, b) => a - b).join(',');
	}

	private getKey(nodeId: string, shardKey: string): string {
		return `lavalink/session/${nodeId}/shards:${shardKey}`;
	}

	/** 세션 저장 (TTL: resume timeout과 동일하게 5분) — 실제 기록 여부를 돌려준다(Redis 단절 중 거짓 성공 로그 방지). */
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

	/** 세션 조회 */
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

	/** 세션 삭제 */
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
	/** audio는 setupAudio 뒤에 만들어져서 호출 시점에 읽어요 */
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

	/** 범용 캐시 삭제 — pending 키 선점 소비(봇 프로필) 등에서 사용해요 */
	public async deleteCacheValue(key: string): Promise<void> {
		try {
			if (this.isReady) await this.redis.del(key);
		} catch (error) {
			this.logger.warn(`Cache delete failed (${key}): ${error}`);
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

	/** 범용 해시 전체 읽기 — 카운팅 채널 상태 등. 미연결/오류 시 null (호출자가 기본값으로 폴백) */
	public async getCacheHashFields(key: string): Promise<Record<string, string> | null> {
		try {
			if (this.isReady) return await this.redis.hGetAll(key);
		} catch (error) {
			this.logger.warn(`Cache hGetAll failed (${key}): ${error}`);
		}
		return null;
	}

	/** 범용 해시 필드 저장 — 미연결/오류 시 조용히 스킵해요 (재생 경로처럼 호출부를 블로킹하지 않아요) */
	public async setCacheHashFields(key: string, fields: Record<string, string>): Promise<void> {
		try {
			if (this.isReady && Object.keys(fields).length > 0) await this.redis.hSet(key, fields);
		} catch (error) {
			this.logger.warn(`Cache hSet failed (${key}): ${error}`);
		}
	}

	/** 범용 해시 필드 삭제 — 미연결/오류 시 조용히 스킵해요 */
	public async deleteCacheHashField(key: string, field: string): Promise<void> {
		try {
			if (this.isReady) await this.redis.hDel(key, field);
		} catch (error) {
			this.logger.warn(`Cache hDel failed (${key}): ${error}`);
		}
	}

	/**
	 * isReady 가드 + fire-and-forget 퍼블리시 — Redis 미연결/오류 시 조용히 스킵하고
	 * 재생 경로를 절대 블로킹하지 않아요. label은 스킵/실패 로그 구분에만 쓰여요.
	 * 응답자·상태 퍼블리시는 lib/redisPublisher.ts의 RedisPublisher가 이 메서드로 같은 연결에 실어 보내요.
	 */
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

	/**
	 * 플레이어 상태를 Redis Pub/Sub으로 퍼블리시해요 (채널: `sirubot:player:{guildId}`).
	 * data-api의 playerHub가 구독해 대시보드 라이브 뷰에 서빙해요.
	 *
	 * NOTE: incrementCacheCounter(aiChatService)와 마찬가지로 RedisStore 공용 헬퍼예요.
	 * 제어(재생/정지)는 이 퍼블리시로 하지 않아요 — 제어는 bot RPC로 별도 구현 예정이에요.
	 */
	public publishRawPlayerState(guildId: string, payload: string): void {
		this.publish(playerStateChannel(guildId), payload, `Player state (guild ${guildId})`);
	}

	public async connect() {
		await this.redis.connect();
	}

	public async disconnect() {
		// 미 ready(재연결 시도 중)에서도 소켓이 열려 있으면 반드시 닫는다 — 안 그러면
		// node-redis의 내장 재연결 루프가 살아남아 우아한 종료를 붙잡고 SIGKILL까지 가게 한다.
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

	/** 종료 전 pending 저널 비우기 — Redis를 끊은 뒤에는 큐/플레이어 변경이 소실된다. */
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

	/** 재연결·오류·종료 공용 — ready 플래그를 내리고 하위 저장소에도 단절을 알린다. (이중 단절 알림 방지) */
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
