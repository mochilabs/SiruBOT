import { container } from '@sapphire/framework';
import { type RedisClientType } from '@redis/client';
import { MemoryCache } from '@sirubot/utils';
import { syncPendingWrites } from '../pendingWriteSync.ts';
import { SapphireInterfaceLogger } from '../../../../core/logger.ts';
import { ILogObj, Logger } from 'tslog';
import { CustomPlayer, CustomPlayerJson } from './customPlayer.ts';

export class CachedPlayerSaver {
	private cache: MemoryCache<string, string>;
	private isRedisConnected = true;
	private pendingWrites: Map<string, string> = new Map();
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

	/** Redis 키 TTL — 플레이어가 파괴되지 않은 채 남은 키(크래시 잔재)가 영구 누수되지 않도록 한다. */
	private static readonly REDIS_TTL_SECONDS = 7 * 24 * 60 * 60;

	public async set(player: CustomPlayer): Promise<void> {
		const key = this.getKey(player.guildId);
		const stringValue = this.stringify(player);

		this.logger.trace(`Setting player for guild ${player.guildId}`);

		this.cache.set(key, stringValue);

		try {
			if (this.isRedisConnected) {
				await this.redis.set(key, stringValue, { EX: CachedPlayerSaver.REDIS_TTL_SECONDS });
				// 직접 쓰기 성공 시 낡은 pending 값은 버린다 — 다음 재연결 sync가 과거 값을 되살리는 것을 막는다.
				this.pendingWrites.delete(key);
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

	/** 저장 시각(savedAt)은 재시작 복구의 신선도 판별에 쓰인다(구버전 잔재에는 없을 수 있다). */
	public async get(guildId: string): Promise<(Omit<CustomPlayerJson, 'queue'> & { savedAt?: number }) | null> {
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
				// 직접 삭제 성공 시 낡은 pending 값도 버린다 — 다음 sync가 삭제된 플레이어를 되살린다.
				this.pendingWrites.delete(key);
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

	private stringify(player: CustomPlayer): string {
		const { queue, ...playerData } = player.toJSON(); // queue 분리
		// 재시작 복구 판별용 시각 — 오래된 잔재는 복구하지 않고 정리한다.
		return JSON.stringify({ ...playerData, savedAt: Date.now() });
	}

	/** 저장된 플레이어가 있는 길드 목록 — 세션이 새로 생겼을 때(크래시 재시작) 복구 대상 탐색용. */
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
		await syncPendingWrites(this.redis, this.pendingWrites, CachedPlayerSaver.REDIS_TTL_SECONDS, this.logger);
		if (this.pendingWrites.size > 0) {
			await syncPendingWrites(this.redis, this.pendingWrites, CachedPlayerSaver.REDIS_TTL_SECONDS, this.logger);
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
