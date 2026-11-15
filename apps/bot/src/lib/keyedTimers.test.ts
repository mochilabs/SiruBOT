import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyedTimers } from './keyedTimers.ts';

describe('KeyedTimers', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('지연 뒤에 콜백을 한 번 실행하고 키를 비워요', () => {
		const timers = new KeyedTimers('test');
		const fn = vi.fn();
		timers.set('g1', fn, 1000);
		expect(timers.has('g1')).toBe(true);
		vi.advanceTimersByTime(1000);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(timers.has('g1')).toBe(false);
	});

	it('같은 키로 다시 걸면 이전 타이머를 취소해요', () => {
		const timers = new KeyedTimers('test');
		const first = vi.fn();
		const second = vi.fn();
		timers.set('g1', first, 1000);
		timers.set('g1', second, 1000);
		vi.advanceTimersByTime(1000);
		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledTimes(1);
	});

	it('stop()은 남은 타이머를 모두 해제하고 이후 set은 무시해요', async () => {
		const timers = new KeyedTimers('test');
		const fn = vi.fn();
		timers.set('g1', fn, 1000);
		timers.set('g2', fn, 2000);
		await timers.stop();
		expect(vi.getTimerCount()).toBe(0);
		timers.set('g3', fn, 1000);
		expect(vi.getTimerCount()).toBe(0);
		vi.advanceTimersByTime(5000);
		expect(fn).not.toHaveBeenCalled();
	});
});
