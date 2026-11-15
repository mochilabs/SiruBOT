import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	fetch: vi.fn()
}));

const logger = { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() };
const deps = { logger, getApplication: () => ({ emojis: { fetch: mocks.fetch } }) as never };

import { AppEmojiManager } from './appEmojiManager.ts';

describe('AppEmojiManager 재동기화 타이머', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		mocks.fetch.mockReset();
		mocks.fetch.mockRejectedValue(new Error('api down'));
	});

	afterEach(() => vi.useRealTimers());

	it('조회에 실패한 비업로드 샤드는 30초 뒤 재동기화를 예약해요', async () => {
		const manager = new AppEmojiManager(deps);
		await manager.sync(false);
		expect(vi.getTimerCount()).toBe(1);
		await vi.advanceTimersByTimeAsync(30_000);
		expect(mocks.fetch).toHaveBeenCalledTimes(2);
		await manager.stop();
	});

	it('stop()은 예약된 재동기화를 해제하고 이후 예약도 만들지 않아요', async () => {
		const manager = new AppEmojiManager(deps);
		await manager.sync(false);
		expect(vi.getTimerCount()).toBe(1);

		await manager.stop();
		expect(vi.getTimerCount()).toBe(0);
		mocks.fetch.mockClear();
		await vi.advanceTimersByTimeAsync(120_000);
		expect(mocks.fetch).not.toHaveBeenCalled();

		await manager.sync(false);
		expect(vi.getTimerCount()).toBe(0);
	});
});
