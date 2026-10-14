import { type RedisClientType } from '@redis/client';
import { container } from '@sapphire/framework';
import { MemoryCache } from '@sirubot/utils';
import { syncPendingWrites } from './pendingWriteSync.ts';
import { SapphireInterfaceLogger } from '../../../core/logger.ts';
import { ILogObj, Logger } from 'tslog';

/**
 * Redis 단절 시 쓰기를 pending 저널에 쌓아 두고 재연결 때 밀어 넣는 저장소 공용 베이스.
 * 키 접두사(getKey)와 get() 의미만 서브클래스가 정의한다.
 *
 * - 직접 쓰기/삭제 성공 시 낡은 pending 값을 버린다 — 남아 있으면 다음 재연결 sync가
 *   과거 값을 되살려 최신 값을 덮어쓴다.
 * - 단절 중 delete는 null 톰스톤으로 남겨 Redis 잔존 값이 sync 때 되살아나지 않게 한다.
 * - sync가 끝난 뒤에만 Redis를 원본으로 취급한다 — 먼저 flip하면 동기화 중 get()이
 *   Redis의 과거 값을 읽어 cache의 더 최신 pending 값을 덮어썼다(재연결 경합).
 */
export abstract class PendingWriteStore {
	/** Redis 키 TTL — 플레이어가 파괴되지 않은 채 남은 키(크래시 잔재)가 영구 누수되지 않도록 한다. (7일) */
	protected static readonly REDIS_TTL_SECONDS = 7 * 24 * 60 * 60;

	protected readonly cache: MemoryCache<string, string>;
	protected isRedisConnected = true;
	protected readonly pendingWrites = new Map<string, string | null>();
	private _logger: Logger<ILogObj> | null = null;

	protected constructor(
		protected readonly redis: RedisClientType,
		private readonly storeName: string,
		cacheOptions: { ttl: number; maxSize: number }
	) {
		this.cache = new MemoryCache<string, string>(cacheOptions);
	}

	protected get logger(): Logger<ILogObj> {
		if (!this._logger) {
			this._logger = (container.logger as SapphireInterfaceLogger).getSubLogger({ name: this.storeName });
		}
		return this._logger;
	}

	/** 서브클래스가 정의하는 Redis 키 — 접두사만 다르다 (queue/player). */
	protected abstract getKey(guildId: string): string;

	/**
	 * 공용 읽기 — Redis 우선, 단절/오류 시 캐시 폴백, 둘 다 없으면 null.
	 * get에서 reject하면 라이브러리 큐 조작까지 원시 오류로 터지므로 catch로 폴백을 보장한다.
	 */
	protected async getRaw(guildId: string): Promise<string | null> {
		const key = this.getKey(guildId);
		try {
			if (this.isRedisConnected) {
				const raw = await this.redis.get(key);
				if (raw !== null) {
					// Redis에서 성공적으로 읽었으면 캐시에도 저장
					this.cache.set(key, raw);
					this.logger.trace(`Retrieved from Redis for guild ${guildId}`);
					return raw;
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
		return null;
	}

	/** 공용 쓰기 — 캐시는 항상 갱신하고, Redis 직접 쓰기 실패/단절 시 저널에 남긴다. */
	protected async writeRaw(guildId: string, stringValue: string): Promise<void> {
		const key = this.getKey(guildId);
		this.cache.set(key, stringValue);
		try {
			if (this.isRedisConnected) {
				await this.redis.set(key, stringValue, { EX: PendingWriteStore.REDIS_TTL_SECONDS });
				// 직접 쓰기 성공 시 낡은 pending 값은 버린다 — 남아 있으면 다음 재연결 sync가
				// 과거 값을 되살려 최신 값을 덮어쓴다.
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

	/** 공용 삭제 — 성공 시 낡은 pending도 버리고, 단절/실패 시 톰스톤(null)을 저널에 남긴다. */
	protected async deleteRaw(guildId: string): Promise<boolean> {
		const key = this.getKey(guildId);
		this.cache.delete(key);
		try {
			if (this.isRedisConnected) {
				const result = await this.redis.del(key);
				// 직접 삭제 성공 시 낡은 pending 값도 버린다 — 다음 sync가 삭제된 값을 되살린다.
				this.pendingWrites.delete(key);
				this.logger.trace(`Successfully deleted from Redis for guild ${guildId}`);
				return result > 0;
			}
			// Redis에 잔존한 값이 재연결 sync 때 되살아나지 않도록 DEL을 저널에 남긴다(톰스톤).
			this.pendingWrites.set(key, null);
			this.logger.trace(`Tombstoned for guild ${guildId}`);
			return true;
		} catch (error) {
			this.logger.warn(`Redis error: ${error}`);
			this.isRedisConnected = false;
			// DEL이 실패했으므로 재연결 후 Redis 잔존 값을 지운다(톰스톤).
			this.pendingWrites.set(key, null);
			return true;
		}
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
		await syncPendingWrites(this.redis, this.pendingWrites, PendingWriteStore.REDIS_TTL_SECONDS, this.logger);
		if (this.pendingWrites.size > 0) {
			await syncPendingWrites(this.redis, this.pendingWrites, PendingWriteStore.REDIS_TTL_SECONDS, this.logger);
		}
	}

	public getCacheStats() {
		return {
			...this.cache.getStats(),
			pendingWrites: this.pendingWrites.size,
			isRedisConnected: this.isRedisConnected
		};
	}
}
