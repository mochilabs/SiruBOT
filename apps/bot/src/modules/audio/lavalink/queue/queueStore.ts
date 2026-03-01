import { type RedisClientType } from '@redis/client';
import { container } from '@sapphire/framework';
import { Awaitable, QueueStoreManager, StoredQueue } from 'lavalink-client';
import { MemoryCache } from '@sirubot/utils';
import { SapphireInterfaceLogger } from '../../../../core/logger.ts';

export class CachedQueueStore implements QueueStoreManager {
	private cache: MemoryCache<string, string>;
	private isRedisConnected = true;
	private pendingWrites: Map<string, string> = new Map();

	constructor(private readonly redis: RedisClientType) {
		this.cache = new MemoryCache<string, string>({
			ttl: 30 * 60 * 1000,
			maxSize: 1000
		});
	}

	private get logger() {
		return (container.logger as SapphireInterfaceLogger).getSubLogger({ name: 'queueStore' });
	}

	private getKey(guildId: string): string {
		return `lavalink/queue/${guildId}`;
	}

	public async get(guildId: string): Promise<string> {
		const key = this.getKey(guildId);

		if (this.isRedisConnected) {
			const rawQueue = await this.redis.get(key);
			if (rawQueue !== null) {
				// Redis에서 성공적으로 읽었으면 캐시에도 저장
				this.cache.set(key, rawQueue);
				this.logger.trace(`Retrieved from Redis for guild ${guildId}`);
				return rawQueue;
			}
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
				await this.redis.set(key, stringValue);
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
		return typeof value === 'string' ? JSON.parse(value) : (value as StoredQueue);
	}

	public stringify(value: StoredQueue | string): Awaitable<StoredQueue | string> {
		this.logger.trace(`Stringifying queue`);
		return typeof value === 'string' ? value : JSON.stringify(value);
	}

	public onConnect(): void {
		this.logger.info('Redis connected, syncing pending writes...');
		this.isRedisConnected = true;

		this.syncPendingWrites();
	}

	public onDisconnect(): void {
		this.logger.warn('Redis disconnected, switching to cache-only mode');
		this.isRedisConnected = false;
	}

	private async syncPendingWrites(): Promise<void> {
		if (this.pendingWrites.size === 0) {
			this.logger.debug('No pending writes to sync');
			return;
		}

		this.logger.info(`Syncing ${this.pendingWrites.size} pending writes...`);

		const promises: Promise<void>[] = [];

		for (const [key, value] of this.pendingWrites.entries()) {
			promises.push(
				this.redis
					.set(key, value)
					.then(() => {
						this.logger.trace(`Synced ${key}`);
					})
					.catch((error) => {
						this.logger.error(`Failed to sync ${key}: ${error}`);
					})
			);
		}

		try {
			await Promise.allSettled(promises);
			this.pendingWrites.clear();
			this.logger.info('All pending writes synced successfully');
		} catch (error) {
			this.logger.error(`Error during sync: ${error}`);
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
