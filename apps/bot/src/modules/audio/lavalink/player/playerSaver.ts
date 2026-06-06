import { container } from '@sapphire/framework';
import { type RedisClientType } from '@redis/client';
import { MemoryCache } from '@sirubot/utils';
import { SapphireInterfaceLogger } from '../../../../core/logger.ts';
import { CustomPlayer, CustomPlayerJson } from './customPlayer.ts';

export class CachedPlayerSaver {
	private cache: MemoryCache<string, string>;
	private isRedisConnected = true;
	private pendingWrites: Map<string, string> = new Map();
	private logger: SapphireInterfaceLogger;

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

		this.logger.trace('audio.player.setting', { guild_id: player.guildId });

		this.cache.set(key, stringValue);

		try {
			if (this.isRedisConnected) {
				await this.redis.set(key, stringValue);
				this.logger.trace('audio.player.set_success', { guild_id: player.guildId });
			} else {
				this.pendingWrites.set(key, stringValue);
				this.logger.trace('audio.player.added_to_pending', { guild_id: player.guildId });
			}
		} catch (error) {
			this.logger.warn('audio.player.redis_error_pending', { guild_id: player.guildId, error });
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
					this.logger.trace('audio.player.redis_retrieved', { guild_id: guildId });
					return JSON.parse(playerData);
				}
			}
		} catch (error) {
			this.logger.warn('audio.player.redis_error_cache_fallback', { guild_id: guildId, error });
			this.isRedisConnected = false;
		}

		const cachedData = this.cache.get(key);
		if (cachedData) {
			this.logger.trace('audio.player.cache_retrieved', { guild_id: guildId });
			return JSON.parse(cachedData);
		}

		this.logger.trace('audio.player.not_found', { guild_id: guildId });
		return null;
	}

	public async delete(guildId: string): Promise<void> {
		const key = this.getKey(guildId);

		this.logger.trace('audio.player.deleting', { guild_id: guildId });

		this.cache.delete(key);

		try {
			if (this.isRedisConnected) {
				await this.redis.del(key);
				this.logger.trace('audio.player.delete_success', { guild_id: guildId });
			} else {
				this.pendingWrites.delete(key);
				this.logger.trace('audio.player.removed_from_pending', { guild_id: guildId });
			}
		} catch (error) {
			this.logger.warn('audio.player.redis_error', { guild_id: guildId, error });
			this.isRedisConnected = false;
			this.pendingWrites.delete(key);
		}
	}

	private stringify(player: CustomPlayer): string {
		const { queue, ...playerData } = player.toJSON(); // queue 분리
		return JSON.stringify(playerData);
	}

	public onConnect(): void {
		this.logger.info('audio.player.sync_started');
		this.isRedisConnected = true;
		this.syncPendingWrites();
	}

	public onDisconnect(): void {
		this.logger.warn('audio.player.redis_disconnected');
		this.isRedisConnected = false;
	}

	private async syncPendingWrites(): Promise<void> {
		if (this.pendingWrites.size === 0) {
			this.logger.debug('audio.player.no_pending_sync');
			return;
		}

		this.logger.info('audio.player.syncing', { pending_writes_count: this.pendingWrites.size });

		const promises: Promise<void>[] = [];

		for (const [key, value] of this.pendingWrites.entries()) {
			promises.push(
				this.redis
					.set(key, value)
					.then(() => {
						this.logger.trace('audio.player.synced', { key });
					})
					.catch((error) => {
						this.logger.error('audio.player.sync_failed', { key, error });
					})
			);
		}

		try {
			await Promise.allSettled(promises);
			this.pendingWrites.clear();
			this.logger.info('audio.player.sync_completed');
		} catch (error) {
			this.logger.error('audio.player.sync_error', { error });
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
