import { describe, expect, it, vi } from 'vitest';
import { stopAll } from './lifecycle.ts';

const makeLogger = () => ({ warn: vi.fn(), error: vi.fn() });

describe('stopAll', () => {
	it('등록이 없으면 아무 일도 하지 않아요', async () => {
		await expect(stopAll(undefined, makeLogger())).resolves.toBeUndefined();
		await expect(stopAll([], makeLogger())).resolves.toBeUndefined();
	});

	it('모든 stop을 실행하고, 하나가 던져도 이름과 함께 로그만 남겨요', async () => {
		const logger = makeLogger();
		const ran: string[] = [];
		await stopAll(
			[
				{ name: 'a', stop: async () => void ran.push('a') },
				{
					name: 'b',
					stop: async () => {
						throw new Error('boom');
					}
				},
				{ name: 'c', stop: async () => void ran.push('c') }
			],
			logger
		);
		expect(ran).toEqual(['a', 'c']);
		expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to stop b'));
	});

	it('상한 시간이 지나면 멈춘 stop을 기다리지 않고 경고해요', async () => {
		vi.useFakeTimers();
		try {
			const logger = makeLogger();
			const done = stopAll([{ name: 'hung', stop: () => new Promise<void>(() => {}) }], logger, 1000);
			await vi.advanceTimersByTimeAsync(1000);
			await done;
			expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('1000ms'));
		} finally {
			vi.useRealTimers();
		}
	});
});
