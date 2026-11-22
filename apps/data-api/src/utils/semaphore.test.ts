import { describe, expect, it } from 'vitest';
import { createSemaphore } from './semaphore.ts';

describe('createSemaphore', () => {
	it('동시에 limit개까지만 실행하고 나머지는 순서대로 기다려요', async () => {
		const run = createSemaphore(2);
		let active = 0;
		let peak = 0;
		const order: number[] = [];
		const task = (id: number) => async () => {
			active += 1;
			peak = Math.max(peak, active);
			order.push(id);
			await new Promise((resolve) => setTimeout(resolve, 10));
			active -= 1;
			return id;
		};
		const results = await Promise.all([1, 2, 3, 4, 5].map((id) => run(task(id))));
		expect(results).toEqual([1, 2, 3, 4, 5]);
		expect(peak).toBe(2);
		expect(order).toEqual([1, 2, 3, 4, 5]);
	});

	it('작업이 실패해도 자리를 돌려줘요', async () => {
		const run = createSemaphore(1);
		await expect(run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
		await expect(run(() => Promise.resolve('ok'))).resolves.toBe('ok');
	});
});
