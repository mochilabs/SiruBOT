import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from 'discord.js';

const mocks = vi.hoisted(() => ({
	getChatToolSettings: vi.fn(),
	loggerError: vi.fn(),
	getCacheHashFields: vi.fn(),
	setCacheHashFields: vi.fn(),
	deleteCacheValue: vi.fn()
}));

vi.mock('@sapphire/decorators', () => ({ ApplyOptions: () => () => undefined }));
vi.mock('@sapphire/framework', () => {
	const containerMock = {
		guildService: { getChatToolSettings: mocks.getChatToolSettings },
		logger: { error: mocks.loggerError },
		redisStore: {
			getCacheHashFields: mocks.getCacheHashFields,
			setCacheHashFields: mocks.setCacheHashFields,
			deleteCacheValue: mocks.deleteCacheValue
		}
	};
	return {
		container: containerMock,
		Events: { MessageCreate: 'messageCreate' },
		Listener: class {
			container = containerMock;
		}
	};
});

import { CountingChannelListener } from './countingChannel.ts';
import { countingStateKey, loadCountingState } from '../../../../services/countingState.ts';

type FakeOverrides = {
	content?: string;
	userId?: string;
	guildId?: string;
	channelId?: string;
	bot?: boolean;
	webhookId?: string | null;
};

function fakeMessage(overrides: FakeOverrides = {}) {
	const reply = vi.fn().mockResolvedValue(undefined);
	const message = {
		author: { bot: overrides.bot ?? false, id: overrides.userId ?? 'user-1' },
		webhookId: overrides.webhookId ?? null,
		inGuild: () => true,
		channel: { isSendable: () => true },
		guildId: overrides.guildId ?? 'guild-1',
		channelId: overrides.channelId ?? 'counting-channel',
		content: overrides.content ?? '1',
		reply
	} as unknown as Message;
	return { message, reply };
}

function createListener(): CountingChannelListener {
	return new CountingChannelListener(
		{} as ConstructorParameters<typeof CountingChannelListener>[0],
		{} as ConstructorParameters<typeof CountingChannelListener>[1]
	);
}

/** 예약된 write-behind flush가 돌아갈 때까지 한 틱 기다려요 */
const flushTick = () => new Promise<void>((resolve) => setImmediate(resolve));

let listener: CountingChannelListener;

beforeEach(async () => {
	// 이전 테스트의 pending flush/체인이 새 테스트의 호출 기록을 더럽히지 않게 비워요
	await flushTick();
	vi.resetAllMocks();
	listener = createListener();
	mocks.getChatToolSettings.mockResolvedValue({ countingEnabled: true, countingChannelId: 'counting-channel' });
	mocks.getCacheHashFields.mockResolvedValue(null);
	mocks.setCacheHashFields.mockResolvedValue(undefined);
	mocks.deleteCacheValue.mockResolvedValue(undefined);
});

describe('countingChannel 레이스 방지 (길드별 직렬화)', () => {
	it('동시에 도착한 같은 숫자 메시지는 하나만 통과해요', async () => {
		const guildId = 'race-guild';
		const first = fakeMessage({ guildId, userId: 'user-a', content: '1' });
		const second = fakeMessage({ guildId, userId: 'user-b', content: '1' });

		// 두 메시지를 await 없이 동시에 진입시켜 await 경계 사이의 check-then-act 레이스를 재현해요
		await Promise.all([listener.run(first.message), listener.run(second.message)]);

		expect(first.reply).not.toHaveBeenCalled();
		expect(second.reply).toHaveBeenCalledTimes(1);
		expect(second.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('2부터 차례로 세야 해요') }));
		expect(await loadCountingState(guildId)).toEqual({ current: 0, lastUserId: null, best: 1 });
	});

	it('동시에 도착한 숫자 메시지는 도착 순서대로 처리돼요', async () => {
		const guildId = 'order-guild';
		const a = fakeMessage({ guildId, userId: 'u1', content: '1' });
		const b = fakeMessage({ guildId, userId: 'u2', content: '2' });
		const c = fakeMessage({ guildId, userId: 'u3', content: '3' });

		await Promise.all([listener.run(a.message), listener.run(b.message), listener.run(c.message)]);

		expect(a.reply).not.toHaveBeenCalled();
		expect(b.reply).not.toHaveBeenCalled();
		expect(c.reply).not.toHaveBeenCalled();
		expect(await loadCountingState(guildId)).toEqual({ current: 3, lastUserId: 'u3', best: 3 });
	});

	it('다른 길드의 메시지는 앞길드 처리를 기다리지 않아요', async () => {
		let releaseSlow: () => void = () => undefined;
		const slowGate = new Promise<void>((resolve) => {
			releaseSlow = resolve;
		});
		mocks.getChatToolSettings.mockImplementation(async (guildId: string) => {
			if (guildId === 'slow-guild') await slowGate;
			return { countingEnabled: true, countingChannelId: 'counting-channel' };
		});

		const slow = fakeMessage({ guildId: 'slow-guild', content: '1' });
		const fast = fakeMessage({ guildId: 'fast-guild', content: '1' });
		const runSlow = listener.run(slow.message);

		await listener.run(fast.message);
		expect(await loadCountingState('fast-guild')).toEqual({ current: 1, lastUserId: 'user-1', best: 1 });

		releaseSlow();
		await runSlow;
		expect(await loadCountingState('slow-guild')).toEqual({ current: 1, lastUserId: 'user-1', best: 1 });
	});
});

describe('countingChannel 카운팅 규칙 (행동 보존)', () => {
	it('Redis flush가 끝나기를 기다리지 않고 처리를 마쳐요', async () => {
		const guildId = 'pass-guild';
		let release: () => void = () => undefined;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		mocks.setCacheHashFields.mockReturnValue(gate);
		const m = fakeMessage({ guildId, content: '1' });

		// Redis 쓰기가 완료되지 않은 상태에서도 run()이 끝나야 해요 (write-behind)
		await listener.run(m.message);

		expect(m.reply).not.toHaveBeenCalled();
		expect(await loadCountingState(guildId)).toEqual({ current: 1, lastUserId: 'user-1', best: 1 });

		release();
		await flushTick();
		expect(mocks.setCacheHashFields).toHaveBeenCalledWith(countingStateKey(guildId), {
			current: '1',
			lastUserId: 'user-1',
			best: '1'
		});
	});

	it('틀린 숫자는 초기화 안내를 보내요', async () => {
		const guildId = 'wrong-guild';
		mocks.getCacheHashFields.mockResolvedValue({ current: '4', lastUserId: 'someone', best: '7' });
		const m = fakeMessage({ guildId, userId: 'user-2', content: '6' });

		await listener.run(m.message);
		expect(m.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('5부터 차례로 세야 해요') }));
		expect(m.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('최고 기록 7') }));
		expect(await loadCountingState(guildId)).toEqual({ current: 0, lastUserId: null, best: 7 });
	});

	it('같은 사람이 연속으로 세면 막아요', async () => {
		const guildId = 'spam-guild';
		mocks.getCacheHashFields.mockResolvedValue({ current: '4', lastUserId: 'user-1', best: '4' });
		const m = fakeMessage({ guildId, userId: 'user-1', content: '5' });

		await listener.run(m.message);
		expect(m.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('바로 이어서 셀 수 없어요') }));
		expect(await loadCountingState(guildId)).toEqual({ current: 0, lastUserId: null, best: 4 });
	});

	it('숫자가 아닌 메시지는 조용히 무시해요', async () => {
		const m = fakeMessage({ guildId: 'chat-guild', content: 'ㅋㅋㅋ' });

		await listener.run(m.message);
		expect(m.reply).not.toHaveBeenCalled();
		expect(mocks.getCacheHashFields).not.toHaveBeenCalled();
		expect(mocks.setCacheHashFields).not.toHaveBeenCalled();
	});

	it('카운팅이 꺼져 있으면 상태를 건드리지 않아요', async () => {
		mocks.getChatToolSettings.mockResolvedValue({ countingEnabled: false, countingChannelId: null });
		const m = fakeMessage({ guildId: 'off-guild', content: '1' });

		await listener.run(m.message);
		expect(m.reply).not.toHaveBeenCalled();
		expect(mocks.getCacheHashFields).not.toHaveBeenCalled();
	});

	it('카운팅 채널이 아닌 메시지는 무시해요', async () => {
		const m = fakeMessage({ guildId: 'other-channel-guild', channelId: 'not-counting', content: '1' });

		await listener.run(m.message);
		expect(m.reply).not.toHaveBeenCalled();
		expect(mocks.getCacheHashFields).not.toHaveBeenCalled();
	});

	it('봇·웹훅 메시지는 무시해요', async () => {
		const bot = fakeMessage({ guildId: 'bot-guild', content: '1', bot: true });
		const webhook = fakeMessage({ guildId: 'webhook-guild', content: '1', webhookId: 'hook-1' });

		await listener.run(bot.message);
		await listener.run(webhook.message);
		expect(mocks.getChatToolSettings).not.toHaveBeenCalled();
		expect(mocks.getCacheHashFields).not.toHaveBeenCalled();
	});

	it('10 이상 새 최고 기록만 알려줘요', async () => {
		const guildId = 'best-guild';
		mocks.getCacheHashFields.mockResolvedValue({ current: '9', lastUserId: 'someone', best: '9' });
		const m = fakeMessage({ guildId, userId: 'user-2', content: '10' });

		await listener.run(m.message);
		expect(m.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('새 최고 기록') }));
		expect(await loadCountingState(guildId)).toEqual({ current: 10, lastUserId: 'user-2', best: 10 });
	});

	it('10 미만의 새 최고 기록은 조용히 넘겨요', async () => {
		const guildId = 'quiet-best-guild';
		mocks.getCacheHashFields.mockResolvedValue({ current: '2', lastUserId: 'someone', best: '2' });
		const m = fakeMessage({ guildId, userId: 'user-2', content: '3' });

		await listener.run(m.message);
		expect(m.reply).not.toHaveBeenCalled();
		expect(await loadCountingState(guildId)).toEqual({ current: 3, lastUserId: 'user-2', best: 3 });
	});
});
