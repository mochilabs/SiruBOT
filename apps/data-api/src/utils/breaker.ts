import { getLogger } from './logger.ts';

const logger = getLogger('breaker');

type State = 'closed' | 'open' | 'half-open';

interface BreakerState {
	state: State;
	failures: number;
	openedAt: number;
}

/**
 * 간이 서킷 브레이커 (프로바이더별).
 * closed → N연속 실패 → open(쿨다운) → half-open(1회 시도) → closed/open
 */
export class CircuitBreaker {
	private readonly states = new Map<string, BreakerState>();

	public constructor(
		private readonly failureThreshold = 5,
		private readonly cooldownMs = 60_000
	) {}

	public canAttempt(name: string): boolean {
		const s = this.states.get(name);
		if (!s || s.state === 'closed') return true;
		if (s.state === 'open') {
			if (Date.now() - s.openedAt >= this.cooldownMs) {
				s.state = 'half-open';
				return true;
			}
			return false;
		}
		return true; // half-open: 1회 시도 허용 (동시 진입은 dedup이 흡수)
	}

	public recordSuccess(name: string): void {
		this.states.delete(name);
	}

	public recordFailure(name: string): void {
		const s = this.states.get(name) ?? {
			state: 'closed' as State,
			failures: 0,
			openedAt: 0
		};
		s.failures++;
		if (s.state === 'half-open' || s.failures >= this.failureThreshold) {
			if (s.state !== 'open') logger.warn(`circuit open: ${name} (${s.failures} failures)`);
			s.state = 'open';
			s.openedAt = Date.now();
		}
		this.states.set(name, s);
	}

	public snapshot(): Record<string, { state: State; failures: number }> {
		return Object.fromEntries([...this.states.entries()].map(([k, v]) => [k, { state: v.state, failures: v.failures }]));
	}
}

export const breaker = new CircuitBreaker();
