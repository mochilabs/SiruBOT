import { getLogger } from './logger.ts';

const logger = getLogger('breaker');

type State = 'closed' | 'open' | 'half-open';

interface BreakerState {
	state: State;
	failures: number;
	openedAt: number;
}

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
		return true;
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
