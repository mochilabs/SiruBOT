import type { RedisStore } from '../../../music/index.ts';
import type { ChatAbortResult } from './types.ts';

/** 유저 턴 한도 카운터가 쓰는 Redis 저장소 — 아직 연결 전이면 undefined(보호 없이 통과)예요 */
export type TurnCounterStore = Pick<RedisStore, 'incrementCacheCounter'> | undefined;

// 유저당 턴 상한 (10분 윈도우)
/** 윈도우(10분)당 유저별 최대 AI 턴 수 */
const USER_TURN_WINDOW_SECONDS = 10 * 60;
const USER_TURN_LIMIT = 20;
/** Redis 키: ai/turns/{userId}/{윈도우시작시각} — 윈도우마다 자동 정리돼요 */
const userTurnCounterTtl = USER_TURN_WINDOW_SECONDS;

/** 채널 턴 거절 사유: channel_busy는 같은 채널 진행 중, rate_limited는 유저 10분 한도 소진 */
export type ChatTurnDenial = 'channel_busy' | 'rate_limited';

export type ChatTurnGrant = { ok: true; release: () => void } | { ok: false; denial: ChatTurnDenial };

/**
 * 채널 턴 잠금·유저 턴 한도·응답 중지 레지스트리의 소유자예요. 상태(진행 중 채널, 중지 컨트롤러)는
 * 이 인스턴스의 클로저에 있어서 `createAiChat`마다 새로 생기고, 테스트끼리 새지 않아요.
 * Redis 저장소는 연결 전이면 undefined라 호출 시점에 읽어요.
 */
export function createTurnControl(getRedisStore: () => TurnCounterStore) {
	// 응답 중지 레지스트리
	const chatAborts = new Map<string, { controller: AbortController; userId: string }>();

	/** 채널별 동시 턴 잠금 — 멘션 답변과 관리자 초기화가 같은 채널 기록을 동시에 변경하지 않도록 해요 */
	const activeChannelTurns = new Set<string>();

	/** 채널 턴 점유 시도 — 이미 진행 중이면 false */
	function acquireChannelTurn(channelId: string): boolean {
		if (activeChannelTurns.has(channelId)) return false;
		activeChannelTurns.add(channelId);
		return true;
	}

	function releaseChannelTurn(channelId: string): void {
		activeChannelTurns.delete(channelId);
	}

	/**
	 * 유저 턴 소비 시도 — 10분 윈도우당 상한(USER_TURN_LIMIT) 초과 시 false.
	 * Redis 카운터로 셰드 간 공유되며, Redis가 없으면 보호 없이 통과해요. (가용성 우선)
	 */
	async function tryConsumeUserTurn(userId: string): Promise<boolean> {
		const store = getRedisStore();
		if (!store) return true;

		const window = Math.floor(Date.now() / (USER_TURN_WINDOW_SECONDS * 1000));
		const used = await store.incrementCacheCounter(`ai/turns/${userId}:${window}`, userTurnCounterTtl);
		return used <= USER_TURN_LIMIT;
	}

	/**
	 * 채널 턴 확보 → 유저 턴 소모를 한 단계로 묶어요. 채널 턴을 확보한 뒤에 사용량을 소모하고,
	 * 소모에 실패하면 채널 턴을 바로 돌려줘야 해요 (진행 중인 채널에서 응답도 못 받고 사용량만
	 * 빠지는 일을 막기 위해). 성공 시 반환된 release()를 finally에서 호출해요.
	 */
	async function acquireChatTurn(channelId: string, userId: string): Promise<ChatTurnGrant> {
		if (!acquireChannelTurn(channelId)) return { ok: false, denial: 'channel_busy' };
		if (!(await tryConsumeUserTurn(userId))) {
			releaseChannelTurn(channelId);
			return { ok: false, denial: 'rate_limited' };
		}
		return { ok: true, release: () => releaseChannelTurn(channelId) };
	}

	/** 턴 시작 시 중지 컨트롤러를 등록해요. key는 중지 버튼 customId에 쓰여요. */
	function registerChatAbort(userId: string): { key: string; controller: AbortController } {
		const key = crypto.randomUUID().replace(/-/g, '');
		const controller = new AbortController();
		chatAborts.set(key, { controller, userId });
		return { key, controller };
	}

	function releaseChatAbort(key: string): void {
		chatAborts.delete(key);
	}

	/** 중지 버튼 클릭 처리 — 요청자가 본인일 때만 중지해요. */
	function abortChatTurn(key: string, requesterId: string): ChatAbortResult {
		const entry = chatAborts.get(key);
		if (!entry) return 'not_found';
		if (entry.userId !== requesterId) return 'forbidden';
		entry.controller.abort();
		return 'ok';
	}

	return { acquireChannelTurn, releaseChannelTurn, acquireChatTurn, tryConsumeUserTurn, registerChatAbort, releaseChatAbort, abortChatTurn };
}

export type TurnControl = ReturnType<typeof createTurnControl>;
