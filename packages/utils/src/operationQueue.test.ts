import { describe, expect, it } from 'vitest';

import { enqueueOperation } from './operationQueue.js';

describe('enqueueOperation', () => {
	it('같은 키의 작업은 순서대로 실행돼요', async () => {
		const chains = new Map<string, Promise<void>>();
		const order: number[] = [];
		const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

		void enqueueOperation(chains, 'g', async () => {
			await sleep(20);
			order.push(1);
		});
		await enqueueOperation(chains, 'g', async () => {
			order.push(2);
		});

		expect(order).toEqual([1, 2]);
	});

	it('이전 작업 실패가 다음 작업을 막지 않아요', async () => {
		const chains = new Map<string, Promise<void>>();
		const order: number[] = [];

		const failing = enqueueOperation(chains, 'g', async () => {
			throw new Error('boom');
		});
		await enqueueOperation(chains, 'g', async () => {
			order.push(2);
		});

		await expect(failing).rejects.toThrow('boom');
		expect(order).toEqual([2]);
	});

	it('체인이 끝나면 맵에서 스스로 정리돼요', async () => {
		const chains = new Map<string, Promise<void>>();

		await enqueueOperation(chains, 'g', async () => undefined);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(chains.has('g')).toBe(false);
	});

	it('다른 키는 서로 직렬화되지 않아요', async () => {
		const chains = new Map<string, Promise<void>>();
		const order: string[] = [];
		const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

		void enqueueOperation(chains, 'a', async () => {
			await sleep(20);
			order.push('a');
		});
		await enqueueOperation(chains, 'b', async () => {
			order.push('b');
		});

		expect(order).toEqual(['b']);
		await sleep(25);
		expect(order).toEqual(['b', 'a']);
	});
});
