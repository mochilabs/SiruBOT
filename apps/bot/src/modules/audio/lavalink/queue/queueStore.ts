import { type RedisClientType } from '@redis/client';
import { container } from '@sapphire/framework';
import { Awaitable, QueueStoreManager, StoredQueue } from 'lavalink-client';
import { MemoryCache } from '@sirubot/utils';
import { syncPendingWrites } from '../pendingWriteSync.ts';
import { SapphireInterfaceLogger } from '../../../../core/logger.ts';
import { ILogObj, Logger } from 'tslog';

export class CachedQueueStore implements QueueStoreManager {
	private cache: MemoryCache<string, string>;
	private isRedisConnected = true;
	private pendingWrites: Map<string, string> = new Map();
	private _logger: Logger<ILogObj> | null = null;

	/** Redis 키 TTL — 플레이어가 파괴되지 않은 채 남은 키(크래시 잔재)가 영구 누수되지 않도록 한다. (player 키와 동일하게 7일) */
	private static readonly REDIS_TTL_SECONDS = 7 * 24 * 60 * 60;

	constructor(private readonly redis: RedisClientType) {
		this.cache = new MemoryCache<string, string>({
			ttl: 30 * 60 * 1000,
			maxSize: 1000
		});
	}

	private get logger() {
		if (!this._logger) {
			this._logger = (container.logger as SapphireInterfaceLogger).getSubLogger({ name: 'queueStore' });
		}
		return this._logger;
	}

	private getKey(guildId: string): string {
		return `lavalink/queue/${guildId}`;
	}

	public async get(guildId: string): Promise<string> {
		const key = this.getKey(guildId);

		// set/delete와 달리 get에서 reject하면 lavalink 라이브러리 큐 조작(queue.add/splice)까지
		// 원시 오류로 터진다 — catch로 캐시 폴백을 보장한다.
		try {
			if (this.isRedisConnected) {
				const rawQueue = await this.redis.get(key);
				if (rawQueue !== null) {
					// Redis에서 성공적으로 읽었으면 캐시에도 저장
					this.cache.set(key, rawQueue);
					this.logger.trace(`Retrieved from Redis for guild ${guildId}`);
					return rawQueue;
				}
			}
		} catch (error) {
			this.logger.warn(`Redis get failed for guild ${guildId}, falling back to cache: ${error}`);
			this.isRedisConnected = false;
		}

		const cachedData = this.cache.get(key);
		if (cachedData) {
			this.logger.trace(`Retrieved from cache for guild ${guildId}`);
			return cachedData;
		}

		const defaultQueue = JSON.stringify({
			current: null,
			previous: [],
			tracks: []
		});

		this.logger.trace(`No data found, returning default for guild ${guildId}`);
		return defaultQueue;
	}

	public async set(guildId: string, value: StoredQueue | string): Promise<void | boolean> {
		const key = this.getKey(guildId);
		const stringValue = this.stringify(value) as string;

		this.logger.trace(`Setting queue for guild ${guildId}`);

		this.cache.set(key, stringValue);

		try {
			if (this.isRedisConnected) {
				await this.redis.set(key, stringValue, { EX: CachedQueueStore.REDIS_TTL_SECONDS });
				// 직접 쓰기 성공 시 낡은 pending 값은 버린다 — 남아 있으면 다음 재연결 sync가
				// 과거 값을 되살려 최신 큐를 덮어쓴다.
				this.pendingWrites.delete(key);
				this.logger.trace(`Successfully set in Redis for guild ${guildId}`);
			} else {
				this.pendingWrites.set(key, stringValue);
				this.logger.trace(`Added to pending writes for guild ${guildId}`);
			}
		} catch (error) {
			this.logger.warn(`Redis error, added to pending writes: ${error}`);
			this.isRedisConnected = false;
			this.pendingWrites.set(key, stringValue);
		}
	}

	public async delete(guildId: string): Promise<void | boolean> {
		const key = this.getKey(guildId);

		this.logger.trace(`Deleting queue for guild ${guildId}`);

		this.cache.delete(key);

		try {
			if (this.isRedisConnected) {
				const result = await this.redis.del(key);
				// 직접 삭제 성공 시 낡은 pending 값도 버린다 — 다음 sync가 삭제된 큐를 되살린다.
				this.pendingWrites.delete(key);
				this.logger.trace(`Successfully deleted from Redis for guild ${guildId}`);
				return result > 0;
			} else {
				this.pendingWrites.delete(key);
				this.logger.trace(`Removed from pending writes for guild ${guildId}`);
				return true;
			}
		} catch (error) {
			this.logger.warn(`Redis error: ${error}`);
			this.isRedisConnected = false;
			this.pendingWrites.delete(key);
			return true;
		}
	}

	public parse(value: StoredQueue | string): Partial<StoredQueue> {
		this.logger.trace(`Parsing queue`);
		return typeof value === 'string' ? JSON.parse(value) : value;
	}

	public stringify(value: StoredQueue | string): Awaitable<StoredQueue | string> {
		this.logger.trace(`Stringifying queue`);
		return typeof value === 'string' ? value : JSON.stringify(value);
	}

	public onConnect(): void {
		this.logger.info('Redis connected, syncing pending writes...');
		// sync가 끝난 뒤에만 Redis를 원본으로 취급한다 — 먼저 flip하면 동기화 중 get()이
		// Redis의 과거 값을 읽어 cache의 더 최신 pending 값을 덮어썼다(재연결 경합).
		void this.drainPendingWrites().then(() => {
			this.isRedisConnected = true;
		});
	}

	public onDisconnect(): void {
		this.logger.warn('Redis disconnected, switching to cache-only mode');
		this.isRedisConnected = false;
	}

	/** sync 1회 돌리고, 그 사이 새로 쌓인 pending이 남으면 한 번 더 민다. (shutdown 플러시와 onConnect에서 공용) */
	public async drainPendingWrites(): Promise<void> {
		await syncPendingWrites(this.redis, this.pendingWrites, CachedQueueStore.REDIS_TTL_SECONDS, this.logger);
		if (this.pendingWrites.size > 0) {
			await syncPendingWrites(this.redis, this.pendingWrites, CachedQueueStore.REDIS_TTL_SECONDS, this.logger);
		}
	}

	public getCacheStats() {
		return {
			...this.cache.getStats(),
			pendingWrites: this.pendingWrites.size,
			isRedisConnected: this.isRedisConnected
		};
	}

	public cleanupCache(): number {
		return this.cache.cleanup();
	}
}
