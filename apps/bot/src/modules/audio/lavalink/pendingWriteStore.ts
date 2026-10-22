import { type RedisClientType } from '@redis/client';
import { container } from '@sapphire/framework';
import { MemoryCache } from '@sirubot/utils';
import { syncPendingWrites } from './pendingWriteSync.ts';
import { SapphireInterfaceLogger } from '../../../core/logger.ts';
import { ILogObj, Logger } from 'tslog';

/**
 * Redis 단절·장애에 대비해 쓰기를 메모리 저널(pendingWrites)에 남겼다가 재연결 때 밀어 넣는
 * 저장소 공용 베이스. 키 접두사(getKey)와 get() 의미만 서브클래스가 정의한다.
 *
 * 읽기: 저널 → 메모리 캐시 → Redis 순서로 읽는다. 저널이 최신(write-behind 미기록 값과 삭제
 * 톰스톤)이고, 캐시는 TTL만큼 신뢰해 히트 시 Redis를 호출하지 않으며, Redis는 miss/만료 시에만 읽는다.
 *
 * 쓰기: 캐시·저널은 즉시 갱신하고(인메모리가 최신), Redis 기록은 coalesceMs 동안 키별로 묶어 마지막
 * 스냅샷만 보낸다. coalesceMs=0이면 즉시 기록한다. 성공 시 저널 항목을 지우고, 단절/실패 시 저널에 남긴다
 * — 남아 있으면 다음 sync가 과거 값을 되살려 최신을 덮어쓴다. 삭제는 null 톰스톤이라 잔존 키가
 * 되살아나지 않는다. sync가 끝난 뒤에만 Redis를 원본으로 취급한다 — 먼저 flip하면 동기화 중 get이
 * Redis의 과거 값을 읽어 캐시의 최신 값을 덮어쓴다(재연결 경합).
 */
export abstract class PendingWriteStore {
	/** Redis 키 TTL — 플레이어가 파괴되지 않은 채 남은 키(크래시 잔재)가 영구 누수되지 않도록 한다. (7일) */
	protected static readonly REDIS_TTL_SECONDS = 7 * 24 * 60 * 60;

	protected readonly cache: MemoryCache<string, string>;
	protected isRedisConnected = true;
	/** 쓰기 저널이자 write-behind 대기열 — flush 성공 전까지 값(null=삭제 톰스톤)이 여기 남는다. */
	protected readonly pendingWrites = new Map<string, string | null>();
	/** 키별 flush 타이머 — 윈도우의 첫 쓰기가 예약하고 그 시점에 저널의 마지막 스냅샷만 기록한다. */
	private readonly flushTimers = new Map<string, NodeJS.Timeout>();
	/** write-behind 코레일스 윈도우(ms). 0이면 즉시 기록. */
	private readonly coalesceMs: number;
	private _logger: Logger<ILogObj> | null = null;

	protected constructor(
		protected readonly redis: RedisClientType,
		private readonly storeName: string,
		cacheOptions: { ttl: number; maxSize: number },
		coalesceMs = 0
	) {
		this.cache = new MemoryCache<string, string>(cacheOptions);
		this.coalesceMs = coalesceMs;
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
	 * 공용 읽기 — 저널 → 캐시 → Redis 순서로 찾는다.
	 * get에서 reject하면 라이브러리 큐 조작까지 원시 오류로 터지므로 catch로 폴백을 보장한다.
	 */
	protected async getRaw(guildId: string): Promise<string | null> {
		const key = this.getKey(guildId);

		// 저널 항목은 아직 Redis에 반영되지 않은 최신 값이거나 삭제 톰스톤이다.
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
				this.isRedisConnected = false;
			}
		}
		return null;
	}

	/** 공용 쓰기 — 캐시와 저널을 먼저 갱신하고 Redis 기록은 coalesceMs 동안 묶는다(write-behind). */
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

	/** 공용 삭제 — 톰스톤을 먼저 남겨 반영 전의 read가 과거 값을 읽지 못하게 하고, DEL은 즉시 보낸다. */
	protected async deleteRaw(guildId: string): Promise<boolean> {
		const key = this.getKey(guildId);
		this.cache.delete(key);
		this.pendingWrites.set(key, null);
		this.clearFlushTimer(key);
		return this.flushKey(key);
	}

	/**
	 * 저널의 키 1건을 Redis로 보낸다. 실패/단절 시 저널에 남겨 재연결 drain이 재시도하게 한다.
	 * 그 사이 더 최신 값이 들어온 항목은 지우지 않는다 — stale 값이 최신을 덮어쓰는 것을 막는다.
	 */
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
			if (this.pendingWrites.get(key) === entry) this.pendingWrites.delete(key);
			return removed;
		} catch (error) {
			this.logger.warn(`Redis flush failed for ${key}: ${error}`);
			this.isRedisConnected = false;
			return true;
		}
	}

	/** 키별 flush 예약 — 이미 예약돼 있으면 윈도우 종료 시 저널의 마지막 스냅샷이 한 번에 기록된다. */
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
		void this.drainPendingWrites().then(() => {
			this.isRedisConnected = true;
			// drain에서 실패로 남은 항목은 flush 예약을 다시 잡는다.
			for (const key of this.pendingWrites.keys()) this.scheduleFlush(key);
		});
	}

	public onDisconnect(): void {
		this.logger.warn('Redis disconnected, switching to cache-only mode');
		this.isRedisConnected = false;
	}

	/** sync 1회 돌리고, 그 사이 새로 쌓인 pending이 남으면 한 번 더 민다. (shutdown 플러시와 onConnect에서 공용) */
	public async drainPendingWrites(): Promise<void> {
		// 저널이 이미 최신이므로 대기 중인 flush는 여기서 정리해 중복 기록을 막는다.
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
