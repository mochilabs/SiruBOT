import { type RedisClientType } from '@redis/client';
import { container } from '@sapphire/framework';
import { Awaitable, QueueStoreManager, StoredQueue } from 'lavalink-client';
import { MemoryCache } from '@sirubot/utils';
import { SapphireInterfaceLogger } from '../../../../core/logger.ts';

export class CachedQueueStore implements QueueStoreManager {
	private cache: MemoryCache<string, string>;
	private isRedisConnected = true;
	private pendingWrites: Map<string, string> = new Map();
	private _logger: SapphireInterfaceLogger | null = null;

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

		if (this.isRedisConnected) {
			const rawQueue = await this.redis.get(key);
			if (rawQueue !== null) {
				// Redis에서 성공적으로 읽었으면 캐시에도 저장
				this.cache.set(key, rawQueue);
				this.logger.trace('audio.queue.redis_retrieved', { guild_id: guildId });
				return rawQueue;
			}
		}

		const cachedData = this.cache.get(key);
		if (cachedData) {
			this.logger.trace('audio.queue.cache_retrieved', { guild_id: guildId });
			return cachedData;
		}

		const defaultQueue = JSON.stringify({
			current: null,
			previous: [],
			tracks: []
		});

		this.logger.trace('audio.queue.not_found', { guild_id: guildId });
		return defaultQueue;
	}

	public async set(guildId: string, value: StoredQueue | string): Promise<void | boolean> {
		const key = this.getKey(guildId);
		const stringValue = this.stringify(value) as string;

		this.logger.trace('audio.queue.setting', { guild_id: guildId });

		this.cache.set(key, stringValue);

		try {
			if (this.isRedisConnected) {
				await this.redis.set(key, stringValue);
				this.logger.trace('audio.queue.set_success', { guild_id: guildId });
			} else {
				this.pendingWrites.set(key, stringValue);
				this.logger.trace('audio.queue.added_to_pending', { guild_id: guildId });
			}
		} catch (error) {
			this.logger.warn('audio.queue.redis_error_pending', { guild_id: guildId, error });
			this.isRedisConnected = false;
			this.pendingWrites.set(key, stringValue);
		}
	}

	public async delete(guildId: string): Promise<void | boolean> {
		const key = this.getKey(guildId);

		this.logger.trace('audio.queue.deleting', { guild_id: guildId });

		this.cache.delete(key);

		try {
			if (this.isRedisConnected) {
				const result = await this.redis.del(key);
				this.logger.trace('audio.queue.delete_success', { guild_id: guildId });
				return result > 0;
			} else {
				this.pendingWrites.delete(key);
				this.logger.trace('audio.queue.removed_from_pending', { guild_id: guildId });
				return true;
			}
		} catch (error) {
			this.logger.warn('audio.queue.redis_error', { guild_id: guildId, error });
			this.isRedisConnected = false;
			this.pendingWrites.delete(key);
			return true;
		}
	}

	public parse(value: StoredQueue | string): Partial<StoredQueue> {
		this.logger.trace('audio.queue.parsing');
		return typeof value === 'string' ? JSON.parse(value) : value;
	}

	public stringify(value: StoredQueue | string): Awaitable<StoredQueue | string> {
		this.logger.trace('audio.queue.stringifying');
		return typeof value === 'string' ? value : JSON.stringify(value);
	}

	public onConnect(): void {
		this.logger.info('audio.queue.sync_started');
		this.isRedisConnected = true;

		this.syncPendingWrites();
	}

	public onDisconnect(): void {
		this.logger.warn('audio.queue.redis_disconnected');
		this.isRedisConnected = false;
	}

	private async syncPendingWrites(): Promise<void> {
		if (this.pendingWrites.size === 0) {
			this.logger.debug('audio.queue.no_pending_sync');
			return;
		}

		this.logger.info('audio.queue.syncing', { pending_writes_count: this.pendingWrites.size });

		const promises: Promise<void>[] = [];

		for (const [key, value] of this.pendingWrites.entries()) {
			promises.push(
				this.redis
					.set(key, value)
					.then(() => {
						this.logger.trace('audio.queue.synced', { key });
					})
					.catch((error) => {
						this.logger.error('audio.queue.sync_failed', { key, error });
					})
			);
		}

		try {
			await Promise.allSettled(promises);
			this.pendingWrites.clear();
			this.logger.info('audio.queue.sync_completed');
		} catch (error) {
			this.logger.error('audio.queue.sync_error', { error });
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
