import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType } from 'discord.js';
import type { AiToolContext } from './types.ts';

const mocks = vi.hoisted(() => ({
	getGuild: vi.fn(),
	getJtcSettings: vi.fn(),
	getAiSettings: vi.fn(),
	getTtsSettings: vi.fn(),
	getChatToolSettings: vi.fn(),
	setDefaultTextChannel: vi.fn(),
	setDefaultVoiceChannel: vi.fn(),
	setPinnedChannel: vi.fn(),
	setPinnedChannelMode: vi.fn(),
	setPinnedChannelDeleteInput: vi.fn(),
	setDJRole: vi.fn(),
	setJtcEnabled: vi.fn(),
	setJtcTemplate: vi.fn(),
	setJtcUserLimit: vi.fn(),
	setAiMode: vi.fn(),
	setChannelAiEnabled: vi.fn(),
	updateTtsVolume: vi.fn(),
	updateTtsDuck: vi.fn(),
	setChannelTtsEnabled: vi.fn(),
	setCountingEnabled: vi.fn(),
	setCountingChannel: vi.fn(),
	setupMarkerChannel: vi.fn(),
	checkManageGuild: vi.fn()
}));

const mockChannels = new Map<string, unknown>();
const mockRoles = new Map<string, unknown>();

vi.mock('@sapphire/framework', () => ({
	container: {
		guildService: {
			getGuild: mocks.getGuild,
			getJtcSettings: mocks.getJtcSettings,
			getAiSettings: mocks.getAiSettings,
			getTtsSettings: mocks.getTtsSettings,
			getChatToolSettings: mocks.getChatToolSettings,
			setDefaultTextChannel: mocks.setDefaultTextChannel,
			setDefaultVoiceChannel: mocks.setDefaultVoiceChannel,
			setPinnedChannel: mocks.setPinnedChannel,
			setPinnedChannelMode: mocks.setPinnedChannelMode,
			setPinnedChannelDeleteInput: mocks.setPinnedChannelDeleteInput,
			setDJRole: mocks.setDJRole,
			setJtcEnabled: mocks.setJtcEnabled,
			setJtcTemplate: mocks.setJtcTemplate,
			setJtcUserLimit: mocks.setJtcUserLimit,
			setAiMode: mocks.setAiMode,
			setChannelAiEnabled: mocks.setChannelAiEnabled,
			updateTtsVolume: mocks.updateTtsVolume,
			updateTtsDuck: mocks.updateTtsDuck,
			setChannelTtsEnabled: mocks.setChannelTtsEnabled,
			setCountingEnabled: mocks.setCountingEnabled,
			setCountingChannel: mocks.setCountingChannel
		},
		tempVoiceService: {
			setupMarkerChannel: mocks.setupMarkerChannel
		},
		client: {
			guilds: {
				cache: {
					get: vi.fn(() => ({
						id: 'test-guild',
						channels: {
							cache: {
								get: (id: string) => mockChannels.get(id),
								find: (fn: (c: unknown) => boolean) => Array.from(mockChannels.values()).find(fn),
								filter: (fn: (c: unknown) => boolean) => ({
									map: (mapFn: (c: unknown) => unknown) => Array.from(mockChannels.values()).filter(fn).map(mapFn)
								})
							}
						},
						roles: {
							cache: {
								get: (id: string) => mockRoles.get(id),
								find: (fn: (r: unknown) => boolean) => Array.from(mockRoles.values()).find(fn)
							}
						}
					}))
				}
			}
		}
	}
}));

vi.mock('../../modules/audio/utils/permissionCheck.ts', () => ({
	checkManageGuild: mocks.checkManageGuild
}));

import { botSettingsGetTool, botSettingsSetTool } from './botSettings.ts';

function createMockContext(overrides: Partial<AiToolContext> = {}): AiToolContext {
	return {
		guildId: 'test-guild',
		channelId: 'test-channel',
		voiceChannelId: null,
		member: {
			displayName: '관리자'
		} as never,
		userId: 'admin-1',
		username: 'admin',
		...overrides
	};
}

describe('botSettingsGetTool', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockChannels.clear();
		mockRoles.clear();

		mockChannels.set('c-text-1', {
			id: 'c-text-1',
			name: '음악채널',
			isTextBased: () => true,
			isVoiceBased: () => false
		});
		mockRoles.set('r-dj-1', { id: 'r-dj-1', name: 'DJ' });

		mocks.getGuild.mockResolvedValue({
			textChannelId: 'c-text-1',
			voiceChannelId: null,
			pinnedChannelId: null,
			pinnedChannelMode: 'play',
			pinnedChannelDeleteInput: false,
			djRoleId: 'r-dj-1',
			ttsVolume: 100,
			ttsDuckLevel: 30
		});
		mocks.getJtcSettings.mockResolvedValue({
			enabled: true,
			categoryId: null,
			template: '{user}의 방',
			userLimit: 4,
			markerChannelId: null
		});
		mocks.getAiSettings.mockResolvedValue({
			mode: 'all',
			channelIds: []
		});
		mocks.getTtsSettings.mockResolvedValue({
			mode: 'off',
			channelIds: []
		});
		mocks.getChatToolSettings.mockResolvedValue({
			countingEnabled: false,
			countingChannelId: null
		});
	});

	it('서버 봇 설정 정보를 올바르게 반환한다', async () => {
		const ctx = createMockContext();
		const raw = await botSettingsGetTool.execute({}, ctx);
		const data = JSON.parse(raw);

		expect(data.status).toBe('ok');
		expect(data.channels.default_text).toEqual({ id: 'c-text-1', name: '음악채널' });
		expect(data.dj_role).toEqual({ id: 'r-dj-1', name: 'DJ' });
		expect(data.jtc.enabled).toBe(true);
		expect(data.ai.mode).toBe('all');
		expect(data.tts.volume).toBe(100);
	});

	it('DM 컨텍스트에서는 에러를 던진다', async () => {
		const ctx = createMockContext({ guildId: null });
		await expect(botSettingsGetTool.execute({}, ctx)).rejects.toThrow('서버 채널에서만');
	});
});

describe('botSettingsSetTool (2차 권한 검사 및 설정 변경)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockChannels.clear();
		mockRoles.clear();

		mockChannels.set('c-text-1', {
			id: 'c-text-1',
			name: '채팅',
			type: ChannelType.GuildText,
			isTextBased: () => true,
			isVoiceBased: () => false
		});
		mockChannels.set('c-voice-1', {
			id: 'c-voice-1',
			name: '통화방',
			type: ChannelType.GuildVoice,
			isTextBased: () => false,
			isVoiceBased: () => true
		});
		mockChannels.set('c-cat-1', {
			id: 'c-cat-1',
			name: '음성 카테고리',
			type: ChannelType.GuildCategory,
			isTextBased: () => false,
			isVoiceBased: () => false
		});

		mockRoles.set('r-dj-1', { id: 'r-dj-1', name: 'DJ' });

		mocks.checkManageGuild.mockReturnValue(true);
		mocks.updateTtsVolume.mockResolvedValue({ ttsVolume: 120 });
		mocks.updateTtsDuck.mockResolvedValue({ ttsDuckLevel: 50 });
		mocks.setChannelAiEnabled.mockResolvedValue({ mode: 'channels', channelIds: ['c-text-1'] });
		mocks.setChannelTtsEnabled.mockResolvedValue({ mode: 'channels', channelIds: ['c-text-1'] });
	});

	it('서버 관리(ManageGuild) 권한이 없는 유저의 변경 요청은 2차 검사에서 차단된다', async () => {
		mocks.checkManageGuild.mockReturnValue(false);

		const ctx = createMockContext();
		await expect(botSettingsSetTool.execute({ default_text_channel: '채팅' }, ctx)).rejects.toThrow(
			'봇 설정은 서버 관리(Manage Guild) 권한이 있는 멤버만 변경할 수 있어요.'
		);
	});

	it('기본 텍스트 채널을 이름으로 찾아 설정한다', async () => {
		const ctx = createMockContext();
		const raw = await botSettingsSetTool.execute({ default_text_channel: '채팅' }, ctx);
		const res = JSON.parse(raw);

		expect(res.status).toBe('ok');
		expect(mocks.setDefaultTextChannel).toHaveBeenCalledWith('test-guild', 'c-text-1');
		expect(res.updated.default_text_channel).toEqual({ id: 'c-text-1', name: '채팅' });
	});

	it('기본 텍스트 채널에 음성 채널을 지정하면 에러를 던진다', async () => {
		const ctx = createMockContext();
		await expect(botSettingsSetTool.execute({ default_text_channel: '통화방' }, ctx)).rejects.toThrow('텍스트 채널이 아니에요');
	});

	it('기본 텍스트 채널을 "none"으로 전달하면 해제(null)한다', async () => {
		const ctx = createMockContext();
		const raw = await botSettingsSetTool.execute({ default_text_channel: 'none' }, ctx);
		const res = JSON.parse(raw);

		expect(res.status).toBe('ok');
		expect(mocks.setDefaultTextChannel).toHaveBeenCalledWith('test-guild', null);
		expect(res.updated.default_text_channel).toBeNull();
	});

	it('DJ 역할을 멘션(<@&r-dj-1>) 또는 이름으로 설정하거나 해제한다', async () => {
		const ctx = createMockContext();
		const raw = await botSettingsSetTool.execute({ dj_role: '<@&r-dj-1>' }, ctx);
		const res = JSON.parse(raw);

		expect(res.status).toBe('ok');
		expect(mocks.setDJRole).toHaveBeenCalledWith('test-guild', 'r-dj-1');
		expect(res.updated.dj_role).toEqual({ id: 'r-dj-1', name: 'DJ' });

		await botSettingsSetTool.execute({ dj_role: '해제' }, ctx);
		expect(mocks.setDJRole).toHaveBeenCalledWith('test-guild', null);
	});

	it('임시 음성방(JTC) 카테고리 지정 시 카테고리 유효성을 검사하고 marker를 생성한다', async () => {
		const ctx = createMockContext();
		const raw = await botSettingsSetTool.execute(
			{ jtc_enabled: true, jtc_category: '음성 카테고리', jtc_template: '{user}의 아지트', jtc_user_limit: 6 },
			ctx
		);
		const res = JSON.parse(raw);

		expect(res.status).toBe('ok');
		expect(mocks.setupMarkerChannel).toHaveBeenCalledWith('test-guild', 'c-cat-1');
		expect(mocks.setJtcEnabled).toHaveBeenCalledWith('test-guild', true);
		expect(mocks.setJtcTemplate).toHaveBeenCalledWith('test-guild', '{user}의 아지트');
		expect(mocks.setJtcUserLimit).toHaveBeenCalledWith('test-guild', 6);
	});

	it('JTC 카테고리에 일반 텍스트 채널을 지정하면 에러를 던진다', async () => {
		const ctx = createMockContext();
		await expect(botSettingsSetTool.execute({ jtc_category: '채팅' }, ctx)).rejects.toThrow('카테고리가 아니에요');
	});

	it('AI 및 TTS 채널 토글을 올바르게 처리한다', async () => {
		const ctx = createMockContext();
		const raw = await botSettingsSetTool.execute(
			{
				ai_channel_toggle: { channel: '채팅', enabled: true },
				tts_channel_toggle: { channel: '채팅', enabled: false },
				tts_volume: 85
			},
			ctx
		);
		const res = JSON.parse(raw);

		expect(res.status).toBe('ok');
		expect(mocks.setChannelAiEnabled).toHaveBeenCalledWith('test-guild', 'c-text-1', true, ['c-text-1']);
		expect(mocks.setChannelTtsEnabled).toHaveBeenCalledWith('test-guild', 'c-text-1', false, ['c-text-1']);
		expect(mocks.updateTtsVolume).toHaveBeenCalledWith('test-guild', 85);
	});

	it('카운팅 채널 설정 및 활성화를 처리한다', async () => {
		const ctx = createMockContext();
		const raw = await botSettingsSetTool.execute(
			{
				counting_enabled: true,
				counting_channel: '채팅'
			},
			ctx
		);
		const res = JSON.parse(raw);

		expect(res.status).toBe('ok');
		expect(mocks.setCountingEnabled).toHaveBeenCalledWith('test-guild', true);
		expect(mocks.setCountingChannel).toHaveBeenCalledWith('test-guild', 'c-text-1');
	});

	it('변경할 항목이 없을 때 에러를 던진다', async () => {
		const ctx = createMockContext();
		await expect(botSettingsSetTool.execute({}, ctx)).rejects.toThrow('변경할 봇 설정 항목이 지정되지 않았어요.');
	});
});
