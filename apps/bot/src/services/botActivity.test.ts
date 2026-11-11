import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getConfig, setConfigForTesting } from '../lib/config.ts';
import { makeTestConfig } from '../lib/config.testing.ts';

const mocks = vi.hoisted(() => ({
	setActivity: vi.fn()
}));

const client = {
	isReady: () => true,
	guilds: { cache: { size: 2, reduce: () => 10 } },
	ws: { ping: 12 },
	user: { username: 'bot', setActivity: mocks.setActivity }
};

import { BotActivityService } from './botActivity.ts';

describe('BotActivityService', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		setConfigForTesting(makeTestConfig({ BOT_ACTIVITY: '서버 %guilds%개' }));
	});

	afterEach(() => {
		vi.useRealTimers();
		setConfigForTesting(null);
	});

	it('start()는 즉시 한 번 갱신하고 주기마다 다시 갱신해요', async () => {
		const service = new BotActivityService({
			activity: getConfig().discord.botActivity,
			getClient: () => client as never,
			getPlayerCount: () => 0
		});
		service.start();
		expect(mocks.setActivity).toHaveBeenCalledTimes(1);
		expect(mocks.setActivity).toHaveBeenLastCalledWith('서버 2개');
		await vi.advanceTimersByTimeAsync(60_000);
		expect(mocks.setActivity).toHaveBeenCalledTimes(2);
		await service.stop();
	});

	it('stop()은 인터벌을 해제하고 이후 start는 무시해요', async () => {
		const service = new BotActivityService({
			activity: getConfig().discord.botActivity,
			getClient: () => client as never,
			getPlayerCount: () => 0
		});
		service.start();
		expect(vi.getTimerCount()).toBe(1);

		await service.stop();
		expect(vi.getTimerCount()).toBe(0);
		mocks.setActivity.mockClear();
		await vi.advanceTimersByTimeAsync(180_000);
		expect(mocks.setActivity).not.toHaveBeenCalled();

		service.start();
		expect(vi.getTimerCount()).toBe(0);
		expect(mocks.setActivity).not.toHaveBeenCalled();
	});
});
