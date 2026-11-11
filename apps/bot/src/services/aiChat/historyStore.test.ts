import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	upsert: vi.fn(),
	logger: { error: vi.fn(), warn: vi.fn() }
}));

vi.mock('@sapphire/framework', () => ({
	container: {
		db: { channelChatHistory: { upsert: mocks.upsert, findUnique: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() } },
		logger: mocks.logger
	}
}));

import { setConfigForTesting } from '../../lib/config.ts';
import { makeTestConfig } from '../../lib/config.testing.ts';
import { ChannelHistoryStore } from './historyStore.ts';

const user = (content: string, messageId: string) => ({ role: 'user' as const, content, messageId, author: '유저' });

describe('ChannelHistoryStore 수명주기', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.upsert.mockResolvedValue({});
		vi.useFakeTimers();
		setConfigForTesting(makeTestConfig());
	});

	afterEach(() => {
		vi.useRealTimers();
		setConfigForTesting(null);
	});

	it('stop()은 디바운스 중인 기록을 기다리지 않고 지금 써요', async () => {
		const store = new ChannelHistoryStore();
		store.setChannelGuild('c1', 'g1');
		store.pushChannelHistory('c1', user('안녕', 'm1'));
		store.pushChannelHistory('c2', user('반가워', 'm2'));
		expect(mocks.upsert).not.toHaveBeenCalled();

		await store.stop();

		expect(mocks.upsert).toHaveBeenCalledTimes(2);
		expect(mocks.upsert).toHaveBeenCalledWith(
			expect.objectContaining({ where: { channelId: 'c1' }, create: expect.objectContaining({ channelId: 'c1', guildId: 'g1' }) })
		);
		// 취소된 타이머가 뒤늦게 다시 쓰지 않아요
		await vi.advanceTimersByTimeAsync(5_000);
		expect(mocks.upsert).toHaveBeenCalledTimes(2);
	});

	it('stop() 뒤에는 새 저장을 예약하지도 쓰지도 않아요', async () => {
		const store = new ChannelHistoryStore();
		store.pushChannelHistory('c1', user('안녕', 'm1'));
		await store.stop();
		mocks.upsert.mockClear();

		store.pushChannelHistory('c1', user('또', 'm2'));
		await vi.advanceTimersByTimeAsync(5_000);
		expect(mocks.upsert).not.toHaveBeenCalled();
		await store.stop();
		expect(mocks.upsert).not.toHaveBeenCalled();
	});

	it('stop()은 이미 진행 중인 기록이 끝날 때까지 기다려요', async () => {
		const store = new ChannelHistoryStore();
		let finish!: () => void;
		mocks.upsert.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
		store.pushChannelHistory('c1', user('안녕', 'm1'));
		await vi.advanceTimersByTimeAsync(500);
		expect(mocks.upsert).toHaveBeenCalledTimes(1);

		let stopped = false;
		const stopping = store.stop().then(() => (stopped = true));
		await vi.advanceTimersByTimeAsync(0);
		expect(stopped).toBe(false);
		finish();
		await stopping;
		expect(stopped).toBe(true);
	});

	it('예약된 저장이 없으면 stop()은 아무것도 쓰지 않아요', async () => {
		const store = new ChannelHistoryStore();
		await store.stop();
		expect(mocks.upsert).not.toHaveBeenCalled();
	});
});
