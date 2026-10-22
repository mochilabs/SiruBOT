import { type RedisClientType } from '@redis/client';
import { PendingWriteStore } from '../pendingWriteStore.ts';
import { CustomPlayer, CustomPlayerJson } from './customPlayer.ts';

export class CachedPlayerSaver extends PendingWriteStore {
	constructor(redis: RedisClientType) {
		super(redis, 'playerSaver', {
			ttl: 30 * 60 * 1000, // 30분
			maxSize: 500
		});
	}

	protected getKey(guildId: string): string {
		return `lavalink/player/${guildId}`;
	}

	public async set(player: CustomPlayer): Promise<void> {
		this.logger.trace(`Setting player for guild ${player.guildId}`);
		await this.writeRaw(player.guildId, this.stringify(player));
	}

	/** 저장 시각(savedAt)은 재시작 복구의 신선도 판별에 쓰인다(구버전 잔재에는 없을 수 있다). */
	public async get(guildId: string): Promise<(Omit<CustomPlayerJson, 'queue'> & { savedAt?: number }) | null> {
		const raw = await this.getRaw(guildId);
		if (raw === null) {
			this.logger.trace(`No data found for guild ${guildId}`);
			return null;
		}
		try {
			return JSON.parse(raw);
		} catch (error) {
			// 손상된 기록이 복구 경로로 새면 원시 throw가 어디로 튈지 알 수 없다 —
			// "기록 없음"이라는 정의된 폴백으로 통일한다.
			this.logger.warn(`Corrupted saved player for guild ${guildId}, ignoring: ${error}`);
			return null;
		}
	}

	public async delete(guildId: string): Promise<void> {
		this.logger.trace(`Deleting player for guild ${guildId}`);
		await this.deleteRaw(guildId);
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
}
