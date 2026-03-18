import { container } from '@sapphire/framework';
import { type RedisClientType } from '@redis/client';
import { MemoryCache } from '@sirubot/utils';
import { SapphireInterfaceLogger } from '../../../../core/logger.ts';
import { ILogObj, Logger } from 'tslog';
import { CustomPlayer, CustomPlayerJson } from './customPlayer.ts';

export class CachedPlayerSaver {
	private cache: MemoryCache<string, string>;
	private isRedisConnected = true;
	private pendingWrites: Map<string, string> = new Map();
	private nodeSessionsCache: Map<string, string> = new Map();
	private logger: Logger<ILogObj>;

	constructor(private readonly redis: RedisClientType) {
		this.cache = new MemoryCache<string, string>({
			ttl: 30 * 60 * 1000, // 30분
			maxSize: 500
		});

		this.logger = (container.logger as SapphireInterfaceLogger).getSubLogger({ name: 'playerSaver' });
	}

	private getKey(guildId: string): string {
		return `lavalink/player/${guildId}`;
	}

	public async set(player: CustomPlayer): Promise<void> {
		const key = this.getKey(player.guildId);
		const stringValue = this.stringify(player);

		this.logger.trace(`Setting player for guild ${player.guildId}`);

		this.cache.set(key, stringValue);

		try {
			if (this.isRedisConnected) {
				await this.redis.set(key, stringValue);
				this.logger.trace(`Successfully set in Redis for guild ${player.guildId}`);
			} else {
				this.pendingWrites.set(key, stringValue);
				this.logger.trace(`Added to pending writes for guild ${player.guildId}`);
			}
		} catch (error) {
			this.logger.warn(`Redis error, added to pending writes: ${error}`);
			this.isRedisConnected = false;
			this.pendingWrites.set(key, stringValue);
		}
	}

	public async get(guildId: string): Promise<Omit<CustomPlayerJson, 'queue'> | null> {
		const key = this.getKey(guildId);

		try {
			if (this.isRedisConnected) {
				const playerData = await this.redis.get(key);
				if (playerData !== null) {
					this.cache.set(key, playerData);
					this.logger.trace(`Retrieved from Redis for guild ${guildId}`);
					return JSON.parse(playerData);
				}
			}
		} catch (error) {
			this.logger.warn(`Redis error, falling back to cache: ${error}`);
			this.isRedisConnected = false;
		}

		const cachedData = this.cache.get(key);
		if (cachedData) {
			this.logger.trace(`Retrieved from cache for guild ${guildId}`);
			return JSON.parse(cachedData);
		}

		this.logger.trace(`No data found for guild ${guildId}`);
		return null;
	}

	public async delete(guildId: string): Promise<void> {
		const key = this.getKey(guildId);

		this.logger.trace(`Deleting player for guild ${guildId}`);

		this.cache.delete(key);

		try {
			if (this.isRedisConnected) {
				await this.redis.del(key);
				this.logger.trace(`Successfully deleted from Redis for guild ${guildId}`);
			} else {
				this.pendingWrites.delete(key);
				this.logger.trace(`Removed from pending writes for guild ${guildId}`);
			}
		} catch (error) {
			this.logger.warn(`Redis error: ${error}`);
			this.isRedisConnected = false;
			this.pendingWrites.delete(key);
		}
	}

	public async getNodeSessions(): Promise<Map<string, string>> {
		try {
			if (this.isRedisConnected) {
				const playerKeys = await this.redis.keys(this.getKey('*'));
				const data = new Map<string, string>();

				if (playerKeys.length > 0) {
					const values = await this.redis.mGet(playerKeys);
					for (const value of values) {
						if (value === null) continue;

						const playerDataJson = JSON.parse(value);
						if (playerDataJson.nodeId === null || playerDataJson.sessionId === null) continue;

						data.set(playerDataJson.nodeId, playerDataJson.nodeSessionId);
					}
				}

				// 캐시 업데이트
				this.nodeSessionsCache = data;
				this.logger.trace(`Retrieved ${data.size} node sessions from Redis`);
				return data;
			}
		} catch (error) {
			this.logger.warn(`Redis error, using cached sessions: ${error}`);
			this.isRedisConnected = false;
		}

		this.logger.trace(`Using cached node sessions (${this.nodeSessionsCache.size} entries)`);
		return this.nodeSessionsCache;
	}

	private stringify(player: CustomPlayer): string {
		const { queue, ...playerData } = player.toJSON(); // queue 분리
		return JSON.stringify(playerData);
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
			nodeSessionsCacheSize: this.nodeSessionsCache.size,
			isRedisConnected: this.isRedisConnected
		};
	}

	public cleanupCache(): number {
		return this.cache.cleanup();
	}
}
