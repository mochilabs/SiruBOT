import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	container: {
		logger: { warn: vi.fn() },
		audio: { getPlayer: vi.fn() },
		ttsService: { isEnabled: vi.fn() },
		guildService: {},
		guildChatPolicy: { getTtsJoinAnnounce: vi.fn(), getTtsLeaveAnnounce: vi.fn() },
		ttsUserSettings: { get: vi.fn() },
		chatTtsService: { speakNow: vi.fn() }
	}
}));

vi.mock('@sapphire/decorators', () => ({ ApplyOptions: () => (target: unknown) => target }));
vi.mock('@sapphire/framework', () => ({
	Events: { VoiceStateUpdate: 'voiceStateUpdate' },
	Listener: class {
		public container = mocks.container;
	}
}));

import { TtsMemberAnnounceListener } from './ttsMemberAnnounce.ts';
vi.mock('../../../services/guildSettings/chatPolicy.ts', () => mocks.container.guildChatPolicy);

const PRESET = { enabled: false, voice: null, channel: 'left', emotion: 'neutral' };

function state(channelId: string | null, name = '시루', bot = false) {
	return { channelId, guild: { id: 'guild-1' }, member: { id: 'user-1', displayName: name, user: { bot } } } as never;
}

function run(oldState: never, newState: never) {
	return new (TtsMemberAnnounceListener as unknown as new () => { run: (a: never, b: never) => Promise<void> })().run(oldState, newState);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.container.audio.getPlayer.mockReturnValue({ connected: true, voiceChannelId: 'vc-bot' });
	mocks.container.ttsService.isEnabled.mockReturnValue(true);
	mocks.container.guildChatPolicy.getTtsJoinAnnounce.mockResolvedValue(true);
	mocks.container.guildChatPolicy.getTtsLeaveAnnounce.mockResolvedValue(true);
	mocks.container.ttsUserSettings.get.mockResolvedValue(PRESET);
	mocks.container.chatTtsService.speakNow.mockResolvedValue('overlay');
});

describe('TtsMemberAnnounceListener', () => {
	it('봇 채널에 들어오면 입장 안내를 사용자 프리셋으로 읽는다', async () => {
		await run(state(null), state('vc-bot'));
		expect(mocks.container.chatTtsService.speakNow).toHaveBeenCalledWith(expect.anything(), '시루님이 입장했어요', PRESET);
	});

	it('봇 채널에서 나가면 퇴장 안내를 읽는다', async () => {
		await run(state('vc-bot'), state(null));
		expect(mocks.container.chatTtsService.speakNow).toHaveBeenCalledWith(expect.anything(), '시루님이 퇴장했어요', PRESET);
	});

	it('길드 설정이 꺼져 있으면 읽지 않는다', async () => {
		mocks.container.guildChatPolicy.getTtsJoinAnnounce.mockResolvedValue(false);
		await run(state(null), state('vc-bot'));
		expect(mocks.container.chatTtsService.speakNow).not.toHaveBeenCalled();
	});

	it('다른 채널 이동이나 같은 채널 상태 변화, 봇 계정은 무시한다', async () => {
		await run(state('vc-other'), state('vc-another'));
		await run(state('vc-bot'), state('vc-bot'));
		await run(state(null, '봇', true), state('vc-bot', '봇', true));
		expect(mocks.container.chatTtsService.speakNow).not.toHaveBeenCalled();
	});

	it('긴 이름은 20자로 자르고, 실패는 삼킨다', async () => {
		await run(state(null, 'a'.repeat(40)), state('vc-bot', 'a'.repeat(40)));
		const spoken = mocks.container.chatTtsService.speakNow.mock.calls[0][1] as string;
		expect(spoken.replace('님이 입장했어요', '').length).toBeLessThanOrEqual(20);

		mocks.container.chatTtsService.speakNow.mockRejectedValue(new Error('boom'));
		await expect(run(state(null), state('vc-bot'))).resolves.toBeUndefined();
		expect(mocks.container.logger.warn).toHaveBeenCalled();
	});
});
