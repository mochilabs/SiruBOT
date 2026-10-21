/**
 * 카운팅 채널 계약 — 지정 채널에서 숫자를 순서대로 세어요.
 *
 * 봇의 general/message/countingChannel 리스너가 이 모듈의 순수 함수로만 판정해요.
 * 판정은 순수하게 유지하고 저장은 봇 서비스가 해요.
 */

export interface CountingState {
	current: number;
	lastUserId: string | null;
	best: number;
}

export interface CountingAttemptResult {
	/** 이번 시도가 정답(= current + 1)인지 */
	ok: boolean;
	/** 시도 후의 새 상태 */
	state: CountingState;
	/** 진행 중이던 카운트가 초기화됐는지 (이미 0이었으면 false) */
	reset: boolean;
	/** 새 최고 기록인지 */
	newBest: boolean;
}

/** 카운팅 채널 상태의 기본값 */
export const COUNTING_STATE_DEFAULT: CountingState = { current: 0, lastUserId: null, best: 0 };

/** 메시지가 숫자 하나면 그 값, 아니면 null을 돌려줘요 */
export function parseCountingMessage(content: string): number | null {
	const trimmed = content.trim();
	if (trimmed.length === 0 || trimmed.length > 15 || !/^\d+$/u.test(trimmed)) return null;
	return Number(trimmed);
}

/**
 * 카운팅 시도를 판정해요 — 정답은 current + 1이고, 같은 사람이 연속으로 세는 건 막아요 (혼자 도배 방지).
 * 틀리면 0으로 초기화돼요 (reset: true). 판정은 순수하게 유지하고 저장은 봇 서비스가 해요.
 */
export function evaluateCounting(state: CountingState, attempt: number, userId: string): CountingAttemptResult {
	if (attempt === state.current + 1 && state.lastUserId !== userId) {
		const newBest = attempt > state.best;
		return {
			ok: true,
			state: { current: attempt, lastUserId: userId, best: Math.max(state.best, attempt) },
			reset: false,
			newBest
		};
	}
	return {
		ok: false,
		state: { current: 0, lastUserId: null, best: state.best },
		reset: state.current > 0,
		newBest: false
	};
}
