import { container } from '@sapphire/framework';
import { type RedisClientType } from '@redis/client';
import { Player, PlayerJson } from 'lavalink-client';
import { MemoryCache } from '@sirubot/utils';

export class CachedPlayerSaver {
	private cache: MemoryCache<string, string>;
	private isRedisConnected = true;
	private pendingWrites: Map<string, string> = new Map();
	private nodeSessionsCache: Map<string, string> = new Map();

	constructor(private readonly redis: RedisClientType) {
		this.cache = new MemoryCache<string, string>({
			ttl: 30 * 60 * 1000, // 30분
			maxSize: 500
		});
	}

	private get logger() {
		return container.logger;
	}

	private getKey(guildId: string): string {
		return `lavalink/player/${guildId}`;
	}

	public async set(player: Player): Promise<void> {
		const key = this.getKey(player.guildId);
		const stringValue = this.stringify(player);

		this.logger.trace(`[CachedPlayerSaver/set] Setting player for guild ${player.guildId}`);

		this.cache.set(key, stringValue);

		try {
			if (this.isRedisConnected) {
				await this.redis.set(key, stringValue);
				this.logger.trace(`[CachedPlayerSaver/set] Successfully set in Redis for guild ${player.guildId}`);
			} else {
				this.pendingWrites.set(key, stringValue);
				this.logger.trace(`[CachedPlayerSaver/set] Added to pending writes for guild ${player.guildId}`);
			}
		} catch (error) {
			this.logger.warn(`[CachedPlayerSaver/set] Redis error, added to pending writes: ${error}`);
			this.isRedisConnected = false;
			this.pendingWrites.set(key, stringValue);
		}
	}

	public async get(guildId: string): Promise<Omit<PlayerJson, 'queue'> | null> {
		const key = this.getKey(guildId);

		try {
			if (this.isRedisConnected) {
				const playerData = await this.redis.get(key);
				if (playerData !== null) {
					this.cache.set(key, playerData);
					this.logger.trace(`[CachedPlayerSaver/get] Retrieved from Redis for guild ${guildId}`);
					return JSON.parse(playerData);
				}
			}
		} catch (error) {
			this.logger.warn(`[CachedPlayerSaver/get] Redis error, falling back to cache: ${error}`);
			this.isRedisConnected = false;
		}

		const cachedData = this.cache.get(key);
		if (cachedData) {
			this.logger.trace(`[CachedPlayerSaver/get] Retrieved from cache for guild ${guildId}`);
			return JSON.parse(cachedData);
		}

		this.logger.trace(`[CachedPlayerSaver/get] No data found for guild ${guildId}`);
		return null;
	}

	public async delete(guildId: string): Promise<void> {
		const key = this.getKey(guildId);

		this.logger.trace(`[CachedPlayerSaver/delete] Deleting player for guild ${guildId}`);

		this.cache.delete(key);

		try {
			if (this.isRedisConnected) {
				await this.redis.del(key);
				this.logger.trace(`[CachedPlayerSaver/delete] Successfully deleted from Redis for guild ${guildId}`);
			} else {
				this.pendingWrites.delete(key);
				this.logger.trace(`[CachedPlayerSaver/delete] Removed from pending writes for guild ${guildId}`);
			}
		} catch (error) {
			this.logger.warn(`[CachedPlayerSaver/delete] Redis error: ${error}`);
			this.isRedisConnected = false;
			this.pendingWrites.delete(key);
		}
	}

	public async getNodeSessions(): Promise<Map<string, string>> {
		try {
			if (this.isRedisConnected) {
				const playerKeys = await this.redis.keys(this.getKey('*'));
				const data = new Map<string, string>();

				for (const key of playerKeys) {
					const playerData = await this.redis.get(key);
					if (playerData === null) continue;

					const playerDataJson = JSON.parse(playerData);
					if (playerDataJson.nodeId === null || playerDataJson.sessionId === null) continue;

					data.set(playerDataJson.nodeId, playerDataJson.nodeSessionId);
				}

				// 캐시 업데이트
				this.nodeSessionsCache = data;
				this.logger.trace(`[CachedPlayerSaver/getNodeSessions] Retrieved ${data.size} node sessions from Redis`);
				return data;
			}
		} catch (error) {
			this.logger.warn(`[CachedPlayerSaver/getNodeSessions] Redis error, using cached sessions: ${error}`);
			this.isRedisConnected = false;
		}

		this.logger.trace(`[CachedPlayerSaver/getNodeSessions] Using cached node sessions (${this.nodeSessionsCache.size} entries)`);
		return this.nodeSessionsCache;
	}

	private stringify(player: Player): string {
		const { queue, ...playerData } = player.toJSON();
		return JSON.stringify(playerData);
	}

	public onConnect(): void {
		this.logger.info('[CachedPlayerSaver/onConnect] Redis connected, syncing pending writes...');
		this.isRedisConnected = true;
		this.syncPendingWrites();
	}

	public onDisconnect(): void {
		this.logger.warn('[CachedPlayerSaver/onDisconnect] Redis disconnected, switching to cache-only mode');
		this.isRedisConnected = false;
	}

	private async syncPendingWrites(): Promise<void> {
		if (this.pendingWrites.size === 0) {
			this.logger.debug('[CachedPlayerSaver/syncPendingWrites] No pending writes to sync');
			return;
		}

		this.logger.info(`[CachedPlayerSaver/syncPendingWrites] Syncing ${this.pendingWrites.size} pending writes...`);

		const promises: Promise<void>[] = [];

		for (const [key, value] of this.pendingWrites.entries()) {
			promises.push(
				this.redis
					.set(key, value)
					.then(() => {
						this.logger.trace(`[CachedPlayerSaver/syncPendingWrites] Synced ${key}`);
					})
					.catch((error) => {
						this.logger.error(`[CachedPlayerSaver/syncPendingWrites] Failed to sync ${key}: ${error}`);
					})
			);
		}

		try {
			await Promise.allSettled(promises);
			this.pendingWrites.clear();
			this.logger.info('[CachedPlayerSaver/syncPendingWrites] All pending writes synced successfully');
		} catch (error) {
			this.logger.error(`[CachedPlayerSaver/syncPendingWrites] Error during sync: ${error}`);
		}
	}

	public getCacheStats() {
		return {
			...this.cache.getStats(),
			pendingWrites: this.pendingWrites.size,
			nodeSessionsCacheSize: this.nodeSessionsCache.size,
			isRedisConnected: this.isRedisConnected
		};
	}

	public cleanupCache(): number {
		return this.cache.cleanup();
	}
}
