import { describe, expect, it, vi } from 'vitest';
import { deduped, inflightCount } from './dedup.ts';

describe('deduped', () => {
	it('shares one upstream call for concurrent same-key requests', async () => {
		const task = vi.fn(async () => {
			await new Promise((resolve) => setTimeout(resolve, 20));
			return 'result';
		});
		const [a, b, c] = await Promise.all([deduped('k1', task), deduped('k1', task), deduped('k1', task)]);
		expect(a).toBe('result');
		expect(b).toBe('result');
		expect(c).toBe('result');
		expect(task).toHaveBeenCalledTimes(1);
	});

	it('runs separate tasks for different keys', async () => {
		const task = vi.fn(async (v: string) => v);
		const [a, b] = await Promise.all([deduped('k2', () => task('x')), deduped('k3', () => task('y'))]);
		expect(a).toBe('x');
		expect(b).toBe('y');
		expect(task).toHaveBeenCalledTimes(2);
	});

	it('allows a fresh call after the previous one settles', async () => {
		const task = vi.fn(async () => 'v');
		await deduped('k4', task);
		expect(inflightCount()).toBe(0);
		await deduped('k4', task);
		expect(task).toHaveBeenCalledTimes(2);
	});

	it('cleans up inflight state on failure', async () => {
		const task = vi.fn(async () => {
			throw new Error('boom');
		});
		await expect(deduped('k5', task)).rejects.toThrow('boom');
		expect(inflightCount()).toBe(0);
	});
});
