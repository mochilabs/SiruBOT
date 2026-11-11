/**
 * 카운팅 채널 상태 — 샤드 메모리가 항상 최신이고 Redis 해시는 재시작 복구용이에요.
 *
 * - 카운팅 리스너와 /채팅유틸 카운팅 설정 명령어가 같은 상태를 다뤄요.
 * - 채널을 다시 지정하거나 카운팅을 끄면 상태를 초기화해 새로 1부터 시작해요.
 */
import type { RedisStore } from '../modules/audio/lavalink/redisStore.ts';
import type { Stoppable } from '../lib/lifecycle.ts';
import { type CountingState, COUNTING_STATE_DEFAULT } from '@sirubot/utils';

const COUNTING_KEY_PREFIX = 'sirubot:counting:';

/** Redis 해시 키 — 길드당 하나의 카운팅 상태예요 */
export function countingStateKey(guildId: string): string {
	return `${COUNTING_KEY_PREFIX}${guildId}`;
}

/** 카운팅 상태 저장소가 쓰는 의존성 — redisStore는 setupServices 뒤(setupRedis)에 만들어져서 호출 시점에 읽어요 */
export interface CountingStateDeps {
	getRedisStore: () => Pick<RedisStore, 'getCacheHashFields' | 'setCacheHashFields' | 'deleteCacheValue'>;
}

/**
 * 카운팅 상태의 샤드 메모리와 Redis write-behind를 소유해요 (container.countingState).
 * stop()이 예약된 flush를 지금 쓰고 진행 중인 쓰기를 기다려서, Redis를 끊기 전에 마지막 상태가 흘러가요.
 * stop() 뒤의 저장은 메모리에만 반영하고 Redis에는 쓰지 않아요.
 */
export class CountingStateStore implements Stoppable {
	public readonly name = '카운팅 상태';

	/** 샤드 메모리 캐시 — 길드는 샤드 하나에만 속해요. Redis 없는 개발 환경에서도 동작해요 */
	private readonly memory = new Map<string, CountingState>();
	/** write-behind flush가 예약된 길드 — 같은 틱의 연속 저장은 마지막 상태 하나만 흘러가요 */
	private readonly flushScheduled = new Set<string>();
	/** 진행 중인 Redis 쓰기 — stop()이 끝까지 기다려요 */
	private readonly inFlight = new Set<Promise<void>>();
	private stopped = false;

	public constructor(private readonly deps: CountingStateDeps) {}

	/** 카운팅 상태 조회 — 메모리에 없으면 Redis에서 복구해요 */
	public async load(guildId: string): Promise<CountingState> {
		const cached = this.memory.get(guildId);
		if (cached) return cached;

		const fields = await this.deps
			.getRedisStore()
			.getCacheHashFields(countingStateKey(guildId))
			.catch(() => null);
		if (fields && fields.current !== undefined) {
			const state: CountingState = {
				current: Number.parseInt(fields.current, 10) || 0,
				lastUserId: fields.lastUserId && fields.lastUserId.length > 0 ? fields.lastUserId : null,
				best: Number.parseInt(fields.best, 10) || 0
			};
			this.memory.set(guildId, state);
			return state;
		}
		return COUNTING_STATE_DEFAULT;
	}

	/**
	 * 카운팅 상태 저장 — 메모리에 동기으로 기록하고 Redis에는 write-behind로 흘려보내요 (hot path가 RTT를 기다리지 않아요).
	 * flush는 실행 시점에 메모리의 최신 상태를 읽어 같은 틱의 연속 저장을 하나로 모아요.
	 * Redis 실패는 재시도하지 않아요 — 메모리가 항상 최신이라 다음 저장이 그대로 덮어써요.
	 */
	public save(guildId: string, state: CountingState): void {
		this.memory.set(guildId, state);
		this.scheduleFlush(guildId);
	}

	private scheduleFlush(guildId: string): void {
		if (this.stopped || this.flushScheduled.has(guildId)) return;
		this.flushScheduled.add(guildId);
		queueMicrotask(() => void this.flush(guildId));
	}

	/** 예약돼 있으면 메모리의 최신 상태를 Redis로 보내요 — 이미 flush됐거나 예약이 없으면 아무것도 안 해요 */
	private flush(guildId: string): Promise<void> {
		if (!this.flushScheduled.delete(guildId)) return Promise.resolve();
		const state = this.memory.get(guildId);
		if (!state) return Promise.resolve(); // 그 사이에 초기화됐어요 — 쓸 상태 없음
		const write: Promise<void> = (async () => {
			await this.deps
				.getRedisStore()
				.setCacheHashFields(countingStateKey(guildId), {
					current: String(state.current),
					lastUserId: state.lastUserId ?? '',
					best: String(state.best)
				})
				.catch(() => undefined);
		})().finally(() => this.inFlight.delete(write));
		this.inFlight.add(write);
		return write;
	}

	/** 카운팅 상태 초기화 — 채널 재지정·카운팅 비활성화 시 새로 1부터 시작해요 */
	public async reset(guildId: string): Promise<void> {
		this.memory.delete(guildId);
		await this.deps
			.getRedisStore()
			.deleteCacheValue(countingStateKey(guildId))
			.catch(() => undefined);
	}

	/** 종료: 예약된 flush를 지금 보내고 진행 중인 쓰기를 기다려요. 이후 저장은 Redis로 보내지 않아요. */
	public async stop(): Promise<void> {
		await Promise.all([...this.flushScheduled].map((guildId) => this.flush(guildId)));
		this.stopped = true;
		await Promise.all([...this.inFlight]);
	}
}
