import { afterEach, describe, expect, it, vi } from 'vitest';
import { CircuitBreaker } from './breaker.ts';

describe('CircuitBreaker', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('allows attempts while closed', () => {
		const breaker = new CircuitBreaker(3, 60_000);
		expect(breaker.canAttempt('api')).toBe(true);
		breaker.recordSuccess('api');
		expect(breaker.canAttempt('api')).toBe(true);
	});

	it('opens after reaching the failure threshold', () => {
		const breaker = new CircuitBreaker(3, 60_000);
		breaker.recordFailure('api');
		breaker.recordFailure('api');
		expect(breaker.canAttempt('api')).toBe(true);
		breaker.recordFailure('api');
		expect(breaker.canAttempt('api')).toBe(false);
		expect(breaker.snapshot().api.state).toBe('open');
	});

	it('allows a half-open trial after the cooldown', () => {
		vi.useFakeTimers();
		const breaker = new CircuitBreaker(2, 1000);
		breaker.recordFailure('api');
		breaker.recordFailure('api');
		expect(breaker.canAttempt('api')).toBe(false);
		vi.setSystemTime(Date.now() + 1001);
		expect(breaker.canAttempt('api')).toBe(true);
	});

	it('re-opens when the half-open trial fails', () => {
		vi.useFakeTimers();
		const breaker = new CircuitBreaker(2, 1000);
		breaker.recordFailure('api');
		breaker.recordFailure('api');
		vi.setSystemTime(Date.now() + 1001);
		expect(breaker.canAttempt('api')).toBe(true);
		breaker.recordFailure('api');
		expect(breaker.canAttempt('api')).toBe(false);
		expect(breaker.snapshot().api.state).toBe('open');
	});

	it('closes after a successful half-open trial', () => {
		vi.useFakeTimers();
		const breaker = new CircuitBreaker(2, 1000);
		breaker.recordFailure('api');
		breaker.recordFailure('api');
		vi.setSystemTime(Date.now() + 1001);
		expect(breaker.canAttempt('api')).toBe(true);
		breaker.recordSuccess('api');
		expect(breaker.canAttempt('api')).toBe(true);
		expect(breaker.snapshot().api).toBeUndefined();
	});

	it('tracks providers independently', () => {
		const breaker = new CircuitBreaker(1, 60_000);
		breaker.recordFailure('a');
		expect(breaker.canAttempt('a')).toBe(false);
		expect(breaker.canAttempt('b')).toBe(true);
	});
});
