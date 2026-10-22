import { type RedisClientType } from '@redis/client';
import { Awaitable, QueueStoreManager, StoredQueue } from 'lavalink-client';
import { PendingWriteStore } from '../pendingWriteStore.ts';

/**
 * write-behind 코레일스 윈도우 — 큐 변경 이벤트마다 전체 스냅샷을 Redis로 보내던 것을
 * 이 시간 안의 변경끼리 묶어 마지막 것 하나만 기록한다.
 */
export const QUEUE_WRITE_COALESCE_MS = 400;

/**
 * 큐 저장소 — 읽기는 캐시 우선(저널 → 메모리 → Redis), 쓰기는 인메모리가 먼저다.
 * 코레일스 윈도우 동안 큐의 authoritative 소스는 인메모리이고 Redis는 그만큼 뒤처진다 —
 * Redis 단절 시와 같은 정합성 모델이며, 크래시 시 윈도우(≤QUEUE_WRITE_COALESCE_MS)의
 * 변경만 유실 가능하다. 정상 종료는 종료 순서의 drainPendingWrites가 저널을 모두 비운다.
 */
export class CachedQueueStore extends PendingWriteStore implements QueueStoreManager {
	constructor(redis: RedisClientType) {
		super(
			redis,
			'queueStore',
			{
				ttl: 30 * 60 * 1000,
				maxSize: 1000
			},
			QUEUE_WRITE_COALESCE_MS
		);
	}

	protected getKey(guildId: string): string {
		return `lavalink/queue/${guildId}`;
	}

	public async get(guildId: string): Promise<string> {
		const raw = await this.getRaw(guildId);
		if (raw !== null) return raw;

		const defaultQueue = JSON.stringify({
			current: null,
			previous: [],
			tracks: []
		});

		this.logger.trace(`No data found, returning default for guild ${guildId}`);
		return defaultQueue;
	}

	/** 인메모리 반영은 즉시, Redis 기록은 코레일스 윈도우를 거친다(write-behind). */
	public async set(guildId: string, value: StoredQueue | string): Promise<void | boolean> {
		this.logger.trace(`Setting queue for guild ${guildId}`);
		const stringValue = this.stringify(value) as string;
		await this.writeRaw(guildId, stringValue);
	}

	public async delete(guildId: string): Promise<void | boolean> {
		this.logger.trace(`Deleting queue for guild ${guildId}`);
		return this.deleteRaw(guildId);
	}

	public parse(value: StoredQueue | string): Partial<StoredQueue> {
		this.logger.trace(`Parsing queue`);
		if (typeof value !== 'string') return value;
		try {
			return JSON.parse(value);
		} catch (error) {
			// 손상된 큐 값이 라이브러리로 새면 어디로 튈지 알 수 없다 — 빈 큐로 정의된 폴백을 준다.
			this.logger.warn(`Corrupted stored queue ignored, falling back to an empty queue: ${error}`);
			return { current: null, previous: [], tracks: [] };
		}
	}

	public stringify(value: StoredQueue | string): Awaitable<StoredQueue | string> {
		this.logger.trace(`Stringifying queue`);
		return typeof value === 'string' ? value : JSON.stringify(value);
	}
}
