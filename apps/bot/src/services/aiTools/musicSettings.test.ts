import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../lib/appError.ts';
import type { AiToolContext } from './types.ts';

const mocks = vi.hoisted(() => ({
	getVolume: vi.fn(),
	getRepeat: vi.fn(),
	setRepeat: vi.fn(),
	getRelated: vi.fn(),
	setRelated: vi.fn(),
	getMixerSettings: vi.fn(),
	setGapless: vi.fn(),
	setCrossfade: vi.fn(),
	setNormalization: vi.fn(),
	getTtsAnnounceMode: vi.fn(),
	setTtsAnnounceMode: vi.fn(),
	getEnableController: vi.fn(),
	setEnableController: vi.fn(),
	getGuild: vi.fn(),
	setSponsorBlockSegments: vi.fn(),
	hasDJRole: vi.fn(),
	getPlayer: vi.fn(),
	checkManageGuild: vi.fn(),
	queueRelatedUpfront: vi.fn(),
	setVolume: vi.fn()
}));
const actor = vi.hoisted(() => ({ guildId: 'test-guild', userId: 'user-1' }));
vi.mock('../../features/music/application/actor.ts', () => ({ actorFromMember: () => actor }));

vi.mock('@sapphire/framework', () => ({
	container: {
		guildService: { getGuild: mocks.getGuild },
		music: { setVolume: mocks.setVolume },
		audio: {
			getPlayer: mocks.getPlayer
		},
		mixerService: {
			clearNext: vi.fn(),
			preloadUpcoming: vi.fn(),
			setCrossfade: vi.fn(),
			setNormalization: vi.fn()
		}
	}
}));

vi.mock('../../modules/audio/utils/permissionCheck.ts', () => ({
	checkManageGuild: mocks.checkManageGuild
}));

vi.mock('../../modules/audio/lavalink/autoPlayRelated.ts', () => ({
	queueRelatedUpfront: mocks.queueRelatedUpfront
}));

import { musicSettingsGetTool, musicSettingsSetTool } from './musicSettings.ts';
vi.mock('../guildSettings/playback.ts', async (orig) => ({
	...(await orig()),
	getVolume: mocks.getVolume,
	getRepeat: mocks.getRepeat,
	setRepeat: mocks.setRepeat,
	getRelated: mocks.getRelated,
	setRelated: mocks.setRelated,
	getTtsAnnounceMode: mocks.getTtsAnnounceMode,
	setTtsAnnounceMode: mocks.setTtsAnnounceMode,
	getEnableController: mocks.getEnableController,
	setEnableController: mocks.setEnableController,
	setSponsorBlockSegments: mocks.setSponsorBlockSegments,
	hasDJRole: mocks.hasDJRole
}));
vi.mock('../guildSettings/mixer.ts', async (orig) => ({
	...(await orig()),
	getMixerSettings: mocks.getMixerSettings,
	setGapless: mocks.setGapless,
	setCrossfade: mocks.setCrossfade,
	setNormalization: mocks.setNormalization
}));

function createMockContext(overrides: Partial<AiToolContext> = {}): AiToolContext {
	return {
		guildId: 'test-guild',
		channelId: 'test-channel',
		voiceChannelId: null,
		member: {
			displayName: '테스터'
		} as never,
		userId: 'user-1',
		username: 'tester',
		...overrides
	};
}

describe('musicSettingsGetTool', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getVolume.mockResolvedValue(80);
		mocks.getRepeat.mockResolvedValue('off');
		mocks.getRelated.mockResolvedValue(true);
		mocks.getMixerSettings.mockResolvedValue({
			gaplessEnabled: true,
			crossfadeEnabled: false,
			crossfadeMs: 3000,
			normalizationEnabled: true
		});
		mocks.getTtsAnnounceMode.mockResolvedValue('sequential');
		mocks.getEnableController.mockResolvedValue(true);
		mocks.getGuild.mockResolvedValue({
			sponsorBlockSegments: ['sponsor']
		});
		mocks.getPlayer.mockReturnValue(null);
	});

	it('서버의 전체 음악 설정을 올바르게 반환한다', async () => {
		const ctx = createMockContext();
		const raw = await musicSettingsGetTool.execute({}, ctx);
		const data = JSON.parse(raw);

		expect(data).toEqual({
			status: 'ok',
			volume: 80,
			repeat: 'off',
			autoplay: true,
			gapless: true,
			crossfade: {
				enabled: false,
				duration_seconds: 3
			},
			normalization: true,
			announce_mode: 'sequential',
			controller: true,
			sponsorblock: {
				enabled: true,
				segments: ['sponsor']
			},
			is_playing: false
		});
	});

	it('DM 컨텍스트에서는 에러를 던진다', async () => {
		const ctx = createMockContext({ guildId: null });
		await expect(musicSettingsGetTool.execute({}, ctx)).rejects.toThrow('서버 채널에서만');
	});
});

describe('musicSettingsSetTool (2차 권한 검사 및 설정 변경)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.checkManageGuild.mockReturnValue(false);
		mocks.hasDJRole.mockResolvedValue(false);
		mocks.getMixerSettings.mockResolvedValue({
			gaplessEnabled: true,
			crossfadeEnabled: false,
			crossfadeMs: 3000,
			normalizationEnabled: false
		});
		mocks.setVolume.mockResolvedValue({ volume: 90, playing: false });
		mocks.setRepeat.mockResolvedValue('track');
		mocks.setRelated.mockResolvedValue(true);
		mocks.setCrossfade.mockResolvedValue({ crossfadeEnabled: true, crossfadeMs: 4000 });
		mocks.setTtsAnnounceMode.mockResolvedValue('parallel');
		mocks.getPlayer.mockReturnValue(null);
	});

	it('권한이 없는 유저(관리자 X, DJ X)의 변경 요청은 2차 검사에서 거부된다', async () => {
		mocks.checkManageGuild.mockReturnValue(false);
		mocks.hasDJRole.mockResolvedValue(false);

		const ctx = createMockContext();
		await expect(musicSettingsSetTool.execute({ gapless: true }, ctx)).rejects.toThrow(
			'음악 설정을 변경할 권한이 없어요. DJ 역할을 가지고 있거나 서버 관리 권한이 필요해요.'
		);
	});

	it('서버 관리자(ManageGuild)는 DJ 역할이 없어도 설정을 변경할 수 있다', async () => {
		mocks.checkManageGuild.mockReturnValue(true);
		mocks.hasDJRole.mockResolvedValue(false);

		const ctx = createMockContext();
		const raw = await musicSettingsSetTool.execute({ gapless: true }, ctx);
		const res = JSON.parse(raw);

		expect(res.status).toBe('ok');
		expect(mocks.setGapless).toHaveBeenCalledWith(expect.anything(), 'test-guild', true);
		expect(res.updated).toEqual({ gapless: true });
	});

	it('DJ 역할을 가진 유저는 관리자 권한이 없어도 음악 설정을 변경할 수 있다', async () => {
		mocks.checkManageGuild.mockReturnValue(false);
		mocks.hasDJRole.mockResolvedValue(true);

		const ctx = createMockContext();
		const raw = await musicSettingsSetTool.execute({ autoplay: true, repeat: 'track' }, ctx);
		const res = JSON.parse(raw);

		expect(res.status).toBe('ok');
		expect(mocks.setRelated).toHaveBeenCalledWith(expect.anything(), 'test-guild', true);
		expect(mocks.setRepeat).toHaveBeenCalledWith(expect.anything(), 'test-guild', 'track');
		expect(res.updated).toEqual({ autoplay: true, repeat: 'track' });
	});

	it('볼륨만 바꾸는 요청은 공용 유스케이스가 인가하고, 설정 권한(2차 검사)은 요구하지 않는다', async () => {
		mocks.checkManageGuild.mockReturnValue(false);
		mocks.hasDJRole.mockResolvedValue(false);

		const raw = await musicSettingsSetTool.execute({ volume: 90.4 }, createMockContext());

		expect(mocks.setVolume).toHaveBeenCalledWith(actor, 90);
		expect(JSON.parse(raw).updated).toEqual({ volume: 90 });
	});

	it('볼륨과 다른 설정을 함께 바꾸면 설정 권한도 요구한다', async () => {
		mocks.checkManageGuild.mockReturnValue(false);
		mocks.hasDJRole.mockResolvedValue(false);

		await expect(musicSettingsSetTool.execute({ volume: 90, gapless: true }, createMockContext())).rejects.toThrow(
			'음악 설정을 변경할 권한이 없어요'
		);
		expect(mocks.setVolume).not.toHaveBeenCalled();
	});

	it('유스케이스의 인가·범위 거절은 앱 이모지 마크업을 뗀 안내 문구의 Error로 전달한다', async () => {
		mocks.setVolume.mockRejectedValueOnce(new AppError('forbidden', '<:volume_muted:123> 이 명령어는 DJ 역할이 필요해요.'));
		await expect(musicSettingsSetTool.execute({ volume: 90 }, createMockContext())).rejects.toThrow(new Error('이 명령어는 DJ 역할이 필요해요.'));

		mocks.setVolume.mockRejectedValueOnce(new AppError('invalid_input', '노래 볼륨은(는) **0**부터 **150**까지 설정할 수 있어요.'));
		await expect(musicSettingsSetTool.execute({ volume: 200 }, createMockContext())).rejects.toThrow('0**부터 **150');
	});

	it('서버 채널의 멤버가 아니면 볼륨 변경을 거절한다', async () => {
		await expect(musicSettingsSetTool.execute({ volume: 90 }, createMockContext({ member: null }))).rejects.toThrow('DM에서는');
		expect(mocks.setVolume).not.toHaveBeenCalled();
	});

	it('반복 모드 유효성 검사', async () => {
		mocks.checkManageGuild.mockReturnValue(true);
		const ctx = createMockContext();

		await expect(musicSettingsSetTool.execute({ repeat: 'invalid' }, ctx)).rejects.toThrow('off, track, queue 중 하나');
	});

	it('크로스페이드 지속 시간 유효성 검사 (1초~10초)', async () => {
		mocks.checkManageGuild.mockReturnValue(true);
		const ctx = createMockContext();

		await expect(musicSettingsSetTool.execute({ crossfade_enabled: true, crossfade_duration_seconds: 0.5 }, ctx)).rejects.toThrow(
			'1초에서 10초 사이'
		);
		await expect(musicSettingsSetTool.execute({ crossfade_enabled: true, crossfade_duration_seconds: 15 }, ctx)).rejects.toThrow(
			'1초에서 10초 사이'
		);
	});

	it('곡 안내 모드 유효성 검사 (sequential, parallel, interrupt)', async () => {
		mocks.checkManageGuild.mockReturnValue(true);
		const ctx = createMockContext();

		await expect(musicSettingsSetTool.execute({ announce_mode: 'loud' }, ctx)).rejects.toThrow('sequential, parallel, interrupt 중 하나');
	});

	it('변경할 항목이 하나도 없을 때 에러를 던진다', async () => {
		mocks.checkManageGuild.mockReturnValue(true);
		const ctx = createMockContext();

		await expect(musicSettingsSetTool.execute({}, ctx)).rejects.toThrow('변경할 음악 설정 항목이 지정되지 않았어요.');
	});
});
