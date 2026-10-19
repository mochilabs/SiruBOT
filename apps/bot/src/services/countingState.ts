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

/** Redis 해시 키 — 길드당 하나의 카운팅 상태예요 */
export function countingStateKey(guildId: string): string {
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

/** 카운팅 상태 저장 — 메모리에 심고 Redis에도 흘려요 (Redis 장애여도 이 샤드은 이어가요) */
export async function saveCountingState(guildId: string, state: CountingState): Promise<void> {
	memory.set(guildId, state);
	await container.redisStore.setCacheHashFields(countingStateKey(guildId), {
		current: String(state.current),
		lastUserId: state.lastUserId ?? '',
		best: String(state.best)
	});
}

/** 카운팅 상태 초기화 — 채널 재지정·카운팅 비활성화 시 새로 1부터 시작해요 */
export async function resetCountingState(guildId: string): Promise<void> {
	memory.delete(guildId);
	await container.redisStore.deleteCacheValue(countingStateKey(guildId)).catch(() => undefined);
}
