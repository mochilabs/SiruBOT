import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiToolContext } from './types.ts';

const mocks = vi.hoisted(() => ({
	getVolume: vi.fn(),
	updateVolume: vi.fn(),
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
	queueRelatedUpfront: vi.fn()
}));

vi.mock('@sapphire/framework', () => ({
	container: {
		guildService: {
			getVolume: mocks.getVolume,
			updateVolume: mocks.updateVolume,
			getRepeat: mocks.getRepeat,
			setRepeat: mocks.setRepeat,
			getRelated: mocks.getRelated,
			setRelated: mocks.setRelated,
			getMixerSettings: mocks.getMixerSettings,
			setGapless: mocks.setGapless,
			setCrossfade: mocks.setCrossfade,
			setNormalization: mocks.setNormalization,
			getTtsAnnounceMode: mocks.getTtsAnnounceMode,
			setTtsAnnounceMode: mocks.setTtsAnnounceMode,
			getEnableController: mocks.getEnableController,
			setEnableController: mocks.setEnableController,
			getGuild: mocks.getGuild,
			setSponsorBlockSegments: mocks.setSponsorBlockSegments,
			hasDJRole: mocks.hasDJRole
		},
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
		mocks.updateVolume.mockResolvedValue({ volume: 90 });
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
		expect(mocks.setGapless).toHaveBeenCalledWith('test-guild', true);
		expect(res.updated).toEqual({ gapless: true });
	});

	it('DJ 역할을 가진 유저는 관리자 권한이 없어도 음악 설정을 변경할 수 있다', async () => {
		mocks.checkManageGuild.mockReturnValue(false);
		mocks.hasDJRole.mockResolvedValue(true);

		const ctx = createMockContext();
		const raw = await musicSettingsSetTool.execute({ autoplay: true, repeat: 'track' }, ctx);
		const res = JSON.parse(raw);

		expect(res.status).toBe('ok');
		expect(mocks.setRelated).toHaveBeenCalledWith('test-guild', true);
		expect(mocks.setRepeat).toHaveBeenCalledWith('test-guild', 'track');
		expect(res.updated).toEqual({ autoplay: true, repeat: 'track' });
	});

	it('볼륨 범위(0~150) 유효성 검사', async () => {
		mocks.checkManageGuild.mockReturnValue(true);
		const ctx = createMockContext();

		await expect(musicSettingsSetTool.execute({ volume: 200 }, ctx)).rejects.toThrow('0~150 사이의 정수');
		await expect(musicSettingsSetTool.execute({ volume: -5 }, ctx)).rejects.toThrow('0~150 사이의 정수');
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
