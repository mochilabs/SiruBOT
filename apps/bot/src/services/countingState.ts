/**
 * 카운팅 채널 상태 — 샤드 메모리가 항상 최신이고 Redis 해시는 재시작 복구용이에요.
 *
 * - 카운팅 리스너와 /채팅유틸 카운팅 설정 명령어가 같은 상태를 다뤄요.
 * - 채널을 다시 지정하거나 카운팅을 끄면 상태를 초기화해 새로 1부터 시작해요.
 */
import { container } from '@sapphire/framework';
import { type CountingState, COUNTING_STATE_DEFAULT } from '@sirubot/utils';

const COUNTING_KEY_PREFIX = 'sirubot:counting:';

/** 샤드 메모리 캐시 — 길드는 샤드 하나에만 속해요. Redis 없는 개발 환경에서도 동작해요 */
const memory = new Map<string, CountingState>();

/** write-behind flush가 예약된 길드 — 같은 틱의 연속 저장은 마지막 상태 하나만 흘러가요 */
const flushScheduled = new Set<string>();

/** Redis 해시 키 — 길드당 하나의 카운팅 상태예요 */
function countingStateKey(guildId: string): string {
	return `${COUNTING_KEY_PREFIX}${guildId}`;
}

/** 카운팅 상태 조회 — 메모리에 없으면 Redis에서 복구해요 */
export async function loadCountingState(guildId: string): Promise<CountingState> {
	const cached = memory.get(guildId);
	if (cached) return cached;

	const fields = await container.redisStore.getCacheHashFields(countingStateKey(guildId)).catch(() => null);
	if (fields && fields.current !== undefined) {
		const state: CountingState = {
			current: Number.parseInt(fields.current, 10) || 0,
			lastUserId: fields.lastUserId && fields.lastUserId.length > 0 ? fields.lastUserId : null,
			best: Number.parseInt(fields.best, 10) || 0
		};
		memory.set(guildId, state);
		return state;
	}
	return COUNTING_STATE_DEFAULT;
}

/**
 * 카운팅 상태 저장 — 메모리에 동기으로 기록하고 Redis에는 write-behind로 흘려보내요 (hot path가 RTT를 기다리지 않아요).
 * flush는 실행 시점에 메모리의 최신 상태를 읽어 같은 틱의 연속 저장을 하나로 모아요.
 * Redis 실패는 재시도하지 않아요 — 메모리가 항상 최신이라 다음 저장이 그대로 덮어써요.
 */
export function saveCountingState(guildId: string, state: CountingState): void {
	memory.set(guildId, state);
	scheduleFlush(guildId);
}

function scheduleFlush(guildId: string): void {
	if (flushScheduled.has(guildId)) return;
	flushScheduled.add(guildId);
	queueMicrotask(() => {
		flushScheduled.delete(guildId);
		const state = memory.get(guildId);
		if (!state) return; // 그 사이에 초기화됐어요 — 쓸 상태 없음
		void container.redisStore
			.setCacheHashFields(countingStateKey(guildId), {
				current: String(state.current),
				lastUserId: state.lastUserId ?? '',
				best: String(state.best)
			})
			.catch(() => undefined);
	});
}

/** 카운팅 상태 초기화 — 채널 재지정·카운팅 비활성화 시 새로 1부터 시작해요 */
export async function resetCountingState(guildId: string): Promise<void> {
	memory.delete(guildId);
	await container.redisStore.deleteCacheValue(countingStateKey(guildId)).catch(() => undefined);
}
