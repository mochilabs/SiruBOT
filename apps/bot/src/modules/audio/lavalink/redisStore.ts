import { container } from '@sapphire/framework';
import { createClient, RedisClientType } from '@redis/client';
import { CachedPlayerSaver } from './player/playerSaver.ts';
import { CachedQueueStore } from './queue/queueStore.ts';
import { SapphireInterfaceLogger } from '../../../core/logger.ts';


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
	private logger: SapphireInterfaceLogger;

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
		this.logger.debug('audio.node.session_saving', { node_id: nodeId, shard_key: shardKey, session_id: sessionId });

		try {
			if (this.isRedisConnected) {
				await this.redis.set(key, sessionId, { EX: SESSION_TTL_SECONDS });
				this.logger.trace('audio.node.session_saved', { key });
			}
		} catch (error) {
			this.logger.warn('audio.node.session_save_failed', { error });
			this.isRedisConnected = false;
		}
	}

	/** 세션 조회 */
	public async get(nodeId: string, shardKey: string): Promise<string | null> {
		const key = this.getKey(nodeId, shardKey);

		try {
			if (this.isRedisConnected) {
				const sessionId = await this.redis.get(key);
				this.logger.debug('audio.node.session_lookup', { key, session_id: sessionId });
				return sessionId;
			}
		} catch (error) {
			this.logger.warn('audio.node.session_lookup_failed', { error });
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
				this.logger.trace('audio.node.session_deleted', { key });
			}
		} catch (error) {
			this.logger.warn('audio.node.session_delete_failed', { error });
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
	private logger: SapphireInterfaceLogger;

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
		this.logger.info('system.redis.connected');

		this.queueStore.onConnect();
		this.playerSaver.onConnect();
		this.nodeSessionStore.onConnect();
	}

	private handleReconnecting() {
		this.reconnectTryCount++;
		this.logger.warn('system.redis.reconnecting', { try_count: this.reconnectTryCount });

		if (this.isReady) {
			this.isReady = false;
			this.queueStore.onDisconnect();
			this.playerSaver.onDisconnect();
			this.nodeSessionStore.onDisconnect();
		}
	}

	private handleReady() {
		this.isReady = true;
		this.logger.info('system.redis.ready');
		this.reconnectTryCount = 0;
	}

	private handleError(err: Error) {
		this.logger.error('system.redis.error', { error: err });

		if (this.isReady) {
			this.isReady = false;
			this.queueStore.onDisconnect();
			this.playerSaver.onDisconnect();
			this.nodeSessionStore.onDisconnect();
		}
	}

	private handleEnd() {
		this.logger.warn('system.redis.disconnected');

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
