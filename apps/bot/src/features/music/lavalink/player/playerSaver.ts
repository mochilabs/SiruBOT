import { type RedisClientType } from '@redis/client';
import { PendingWriteStore } from '../pendingWriteStore.ts';
import type { LavalinkLogger } from '../deps.ts';
import { CustomPlayer, CustomPlayerJson } from './customPlayer.ts';

export class CachedPlayerSaver extends PendingWriteStore {
	constructor(redis: RedisClientType, logger: LavalinkLogger) {
		super(
			redis,
			'playerSaver',
			{
				ttl: 30 * 60 * 1000,
				maxSize: 500
			},
			0,
			logger
		);
	}

	protected getKey(guildId: string): string {
		return `lavalink/player/${guildId}`;
	}

	public async set(player: CustomPlayer): Promise<void> {
		this.logger.trace(`Setting player for guild ${player.guildId}`);
		await this.writeRaw(player.guildId, this.stringify(player));
	}

	public async get(guildId: string): Promise<(Omit<CustomPlayerJson, 'queue'> & { savedAt?: number }) | null> {
		const raw = await this.getRaw(guildId);
		if (raw === null) {
			this.logger.trace(`No data found for guild ${guildId}`);
			return null;
		}
		try {
			return JSON.parse(raw);
		} catch (error) {
			this.logger.warn(`Corrupted saved player for guild ${guildId}, ignoring: ${error}`);
			return null;
		}
	}

	public async delete(guildId: string): Promise<void> {
		this.logger.trace(`Deleting player for guild ${guildId}`);
		await this.deleteRaw(guildId);
	}

	private stringify(player: CustomPlayer): string {
		const { queue, ...playerData } = player.toJSON();
		return JSON.stringify({ ...playerData, savedAt: Date.now() });
	}

	public async listGuildIds(): Promise<string[]> {
		const guildIds: string[] = [];
		if (!this.isRedisConnected) {
			this.logger.warn('Redis disconnected, cannot list saved players');
			return guildIds;
		}
		try {
			for await (const key of this.redis.scanIterator({ MATCH: 'lavalink/player/*', COUNT: 100 })) {
				const guildId = String(key).slice('lavalink/player/'.length);
				if (guildId) guildIds.push(guildId);
			}
		} catch (error) {
			this.logger.warn(`Failed to list saved players: ${error}`);
		}
		return guildIds;
	}
}
