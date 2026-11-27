export interface CountingState {
	current: number;
	lastUserId: string | null;
	best: number;
}

export interface CountingAttemptResult {
	ok: boolean;
	state: CountingState;
	reset: boolean;
	newBest: boolean;
}

export const COUNTING_STATE_DEFAULT: CountingState = { current: 0, lastUserId: null, best: 0 };

export function parseCountingMessage(content: string): number | null {
	const trimmed = content.trim();
	if (trimmed.length === 0 || trimmed.length > 15 || !/^\d+$/u.test(trimmed)) return null;
	return Number(trimmed);
}

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
