import { type RedisClientType } from '@redis/client';
import { MemoryCache } from '@sirubot/utils';
import { syncPendingWrites } from './pendingWriteSync.ts';
import type { ILogObj, Logger } from 'tslog';
import type { LavalinkLogger } from './deps.ts';

export abstract class PendingWriteStore {
	protected static readonly REDIS_TTL_SECONDS = 7 * 24 * 60 * 60;

	protected readonly cache: MemoryCache<string, string>;
	protected isRedisConnected = true;
	/** Write journal / write-behind queue; null represents a delete tombstone. */
	protected readonly pendingWrites = new Map<string, string | null>();
	/** Generation counter prevents a stale drain from flipping isRedisConnected after a newer disconnect. */
	private connectGeneration = 0;
	private readonly flushTimers = new Map<string, NodeJS.Timeout>();
	private readonly coalesceMs: number;
	private _logger: Logger<ILogObj> | null = null;

	protected constructor(
		protected readonly redis: RedisClientType,
		private readonly storeName: string,
		cacheOptions: { ttl: number; maxSize: number },
		coalesceMs = 0,
		private readonly baseLogger: LavalinkLogger
	) {
		this.cache = new MemoryCache<string, string>(cacheOptions);
		this.coalesceMs = coalesceMs;
	}

	protected get logger(): Logger<ILogObj> {
		if (!this._logger) {
			this._logger = this.baseLogger.getSubLogger({ name: this.storeName });
		}
		return this._logger;
	}

	protected abstract getKey(guildId: string): string;

	protected async getRaw(guildId: string): Promise<string | null> {
		const key = this.getKey(guildId);

		const pending = this.pendingWrites.get(key);
		if (pending !== undefined) {
			this.logger.trace(`Retrieved from pending journal for guild ${guildId}`);
			return pending;
		}

		const cached = this.cache.get(key);
		if (cached !== undefined) {
			this.logger.trace(`Retrieved from cache for guild ${guildId}`);
			return cached;
		}

		if (this.isRedisConnected) {
			try {
				const raw = await this.redis.get(key);
				if (raw !== null) {
					this.cache.set(key, raw);
					this.logger.trace(`Retrieved from Redis for guild ${guildId}`);
					return raw;
				}
			} catch (error) {
				this.logger.warn(`Redis get failed for guild ${guildId}, falling back to cache: ${error}`);
				this.markOfflineUnlessReady();
			}
		}
		return null;
	}

	protected async writeRaw(guildId: string, stringValue: string): Promise<void> {
		const key = this.getKey(guildId);
		this.cache.set(key, stringValue);
		this.pendingWrites.set(key, stringValue);
		if (this.coalesceMs > 0) {
			this.scheduleFlush(key);
			this.logger.trace(`Queued write for guild ${guildId}`);
			return;
		}
		await this.flushKey(key);
	}

	protected async deleteRaw(guildId: string): Promise<boolean> {
		const key = this.getKey(guildId);
		this.cache.delete(key);
		this.pendingWrites.set(key, null);
		this.clearFlushTimer(key);
		return this.flushKey(key);
	}

	private async flushKey(key: string): Promise<boolean> {
		const entry = this.pendingWrites.get(key);
		if (entry === undefined) return true;
		if (!this.isRedisConnected) return true;

		try {
			let removed = true;
			if (entry === null) {
				removed = (await this.redis.del(key)) > 0;
			} else {
				await this.redis.set(key, entry, { EX: PendingWriteStore.REDIS_TTL_SECONDS });
				this.logger.trace(`Flushed write to Redis for ${key}`);
			}
			// Keep newer pending writes that arrived while this flush was in flight.
			if (this.pendingWrites.get(key) === entry) this.pendingWrites.delete(key);
			return removed;
		} catch (error) {
			this.logger.warn(`Redis flush failed for ${key}: ${error}`);
			this.markOfflineUnlessReady();
			return true;
		}
	}

	// A command can fail on a live connection (timeout, OOM, READONLY). Going offline then would never recover,
	// because only a connect event turns the store back on; the failed write stays pending and is retried instead.
	private markOfflineUnlessReady(): void {
		if (!this.redis.isReady) this.isRedisConnected = false;
	}

	private scheduleFlush(key: string): void {
		if (this.flushTimers.has(key)) return;
		const timer = setTimeout(() => {
			this.flushTimers.delete(key);
			void this.flushKey(key);
		}, this.coalesceMs);
		this.flushTimers.set(key, timer);
	}

	private clearFlushTimer(key: string): void {
		const timer = this.flushTimers.get(key);
		if (!timer) return;
		clearTimeout(timer);
		this.flushTimers.delete(key);
	}

	public onConnect(): void {
		this.logger.info('Redis connected, syncing pending writes...');
		const generation = ++this.connectGeneration;
		void this.drainPendingWrites()
			.catch((error) => {
				this.logger.error(`Pending write drain failed, direct writes resume on next I/O: ${error}`);
			})
			.finally(() => {
				if (this.connectGeneration !== generation) return;
				// Mark connected only after drain finishes so concurrent gets don't read stale Redis values.
				this.isRedisConnected = true;
				for (const key of this.pendingWrites.keys()) this.scheduleFlush(key);
			});
	}

	public onDisconnect(): void {
		this.logger.warn('Redis disconnected, switching to cache-only mode');
		this.connectGeneration++;
		this.isRedisConnected = false;
	}

	public async drainPendingWrites(): Promise<void> {
		for (const timer of this.flushTimers.values()) clearTimeout(timer);
		this.flushTimers.clear();
		await syncPendingWrites(this.redis, this.pendingWrites, PendingWriteStore.REDIS_TTL_SECONDS, this.logger);
		if (this.pendingWrites.size > 0) {
			await syncPendingWrites(this.redis, this.pendingWrites, PendingWriteStore.REDIS_TTL_SECONDS, this.logger);
		}
	}

	public getCacheStats() {
		return {
			...this.cache.getStats(),
			pendingWrites: this.pendingWrites.size,
			scheduledFlushes: this.flushTimers.size,
			isRedisConnected: this.isRedisConnected
		};
	}
}
