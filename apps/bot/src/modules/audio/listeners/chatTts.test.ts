import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	container: {
		logger: { error: vi.fn() },
		audio: { getPlayer: vi.fn() },
		ttsService: { isEnabled: vi.fn() },
		guildService: {},
		guildChatPolicy: { getTtsSettings: vi.fn(), getCustomCommandPrefix: vi.fn() },
		ttsUserSettings: { get: vi.fn() },
		chatTtsService: { handleMessage: vi.fn() }
	}
}));

vi.mock('@sapphire/decorators', () => ({ ApplyOptions: () => (target: unknown) => target }));
vi.mock('@sapphire/framework', () => ({
	Events: { MessageCreate: 'messageCreate' },
	Listener: class {
		public container = mocks.container;
	}
}));
vi.mock('../../../services/chatTts.ts', () => ({ preprocessTtsMessage: (message: { content: string }) => message.content }));

import { ChatTtsListener } from './chatTts.ts';
vi.mock('../../../services/guildSettings/chatPolicy.ts', async (orig) => ({ ...(await orig()), ...mocks.container.guildChatPolicy }));

const PRESET = { enabled: true, voice: null, channel: 'both', emotion: 'neutral' };

function message(channelId: string, content = '안녕') {
	return {
		inGuild: () => true,
		author: { bot: false, id: 'user-1' },
		webhookId: null,
		channel: { type: 0 },
		content,
		channelId,
		guildId: 'guild-1'
	} as never;
}

function run(msg: never) {
	return new (ChatTtsListener as unknown as new () => { run: (m: never) => Promise<void> })().run(msg);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.container.audio.getPlayer.mockReturnValue({ connected: true, voiceChannelId: 'vc-1', textChannelId: 'session-text' });
	mocks.container.ttsService.isEnabled.mockReturnValue(true);
	mocks.container.guildChatPolicy.getTtsSettings.mockResolvedValue({ mode: 'channels', channelIds: ['allowed'] });
	mocks.container.guildChatPolicy.getCustomCommandPrefix.mockResolvedValue('!');
	mocks.container.ttsUserSettings.get.mockResolvedValue(PRESET);
});

describe('ChatTtsListener 채널 정책', () => {
	it('허용 목록의 채널은 읽는다', async () => {
		await run(message('allowed'));
		expect(mocks.container.chatTtsService.handleMessage).toHaveBeenCalledTimes(1);
	});

	it('허용 목록에 없어도 플레이어 세션의 텍스트 채널이면 읽는다', async () => {
		await run(message('session-text'));
		expect(mocks.container.chatTtsService.handleMessage).toHaveBeenCalledTimes(1);
	});

	it('허용 목록도 세션 채널도 아니면 읽지 않는다', async () => {
		await run(message('other'));
		expect(mocks.container.chatTtsService.handleMessage).not.toHaveBeenCalled();
	});

	it('길드 TTS가 꺼져 있으면 세션 채널도 읽지 않는다', async () => {
		mocks.container.guildChatPolicy.getTtsSettings.mockResolvedValue({ mode: 'off', channelIds: [] });
		await run(message('session-text'));
		expect(mocks.container.chatTtsService.handleMessage).not.toHaveBeenCalled();
	});

	it('봇이 음성에 연결돼 있지 않으면 읽지 않는다', async () => {
		mocks.container.audio.getPlayer.mockReturnValue(null);
		await run(message('allowed'));
		expect(mocks.container.chatTtsService.handleMessage).not.toHaveBeenCalled();
	});

	it('사용자가 opt-in하지 않았으면 세션 채널이라도 읽지 않는다', async () => {
		mocks.container.ttsUserSettings.get.mockResolvedValue({ ...PRESET, enabled: false });
		await run(message('session-text'));
		expect(mocks.container.chatTtsService.handleMessage).not.toHaveBeenCalled();
	});
});
