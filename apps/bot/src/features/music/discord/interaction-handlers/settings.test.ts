import { beforeEach, describe, expect, it, vi } from 'vitest';
import { settingsId } from '../customIds.ts';
import SettingsInteractionHandler, { SETTINGS_ACTIONS } from './settings.ts';
import * as guildChannels from '../../../../services/guildSettings/channels.ts';
import * as guildJtc from '../../../../services/guildSettings/jtc.ts';
import * as guildPlayback from '../../../../services/guildSettings/playback.ts';
import * as guildModules from '../../../../services/guildSettings/modules.ts';
import * as guildMixer from '../../../../services/guildSettings/mixer.ts';
import * as guildChatPolicy from '../../../../services/guildSettings/chatPolicy.ts';
import { confirmAction } from '../../../../lib/confirmation.ts';
import { queueRelatedUpfront } from '../../lavalink/autoPlayRelated.ts';
import { checkManageGuild } from '../utils/permissionCheck.ts';
import { settingsView } from '../views/settings.ts';

vi.mock('@sapphire/framework', () => ({
	InteractionHandler: class {
		some = (value?: unknown) => ({ isSome: () => true, unwrap: () => value });
		none = () => ({ isSome: () => false });
	},
	InteractionHandlerTypes: { MessageComponent: 'message-component' },
	container: { lavalink: { marker: 'lavalink' } }
}));
vi.mock('../../../../services/guildSettings/channels.ts');
vi.mock('../../../../services/guildSettings/jtc.ts');
vi.mock('../../../../services/guildSettings/playback.ts');
vi.mock('../../../../services/guildSettings/modules.ts');
vi.mock('../../../../services/guildSettings/mixer.ts');
vi.mock('../../../../services/guildSettings/chatPolicy.ts');
vi.mock('../../../../lib/confirmation.ts', () => ({ confirmAction: vi.fn() }));
vi.mock('../../lavalink/autoPlayRelated.ts', () => ({ queueRelatedUpfront: vi.fn() }));
vi.mock('../utils/permissionCheck.ts', () => ({ checkManageGuild: vi.fn(() => true) }));
vi.mock('../views/settings.ts', async (importOriginal) => ({ ...(await importOriginal<object>()), settingsView: vi.fn(() => 'VIEW') }));

type Kind = 'button' | 'string' | 'role' | 'channel';

function makeInteraction(kind: Kind, values: string[] = []) {
	return {
		guildId: 'g1',
		member: {},
		values,
		channelId: undefined as string | undefined,
		guild: { channels: { cache: { filter: () => ({ map: () => [] as string[] }) } } },
		isButton: () => kind === 'button',
		isStringSelectMenu: () => kind === 'string',
		isRoleSelectMenu: () => kind === 'role',
		isChannelSelectMenu: () => kind === 'channel',
		reply: vi.fn().mockResolvedValue(undefined),
		deferUpdate: vi.fn().mockResolvedValue(undefined),
		editReply: vi.fn().mockResolvedValue(undefined),
		followUp: vi.fn().mockResolvedValue(undefined),
		showModal: vi.fn().mockResolvedValue(undefined)
	};
}

const GUILD = { enableController: true, related: false, repeat: 'off', textChannelDeleteInput: false };

function setup(guild: Record<string, unknown> = GUILD) {
	const player = { playing: true, queue: { current: { info: {} }, tracks: [] as unknown[] }, setRepeatMode: vi.fn() };
	const services = {
		guildService: { getGuild: vi.fn().mockResolvedValue(guild) },
		lavalink: { marker: 'lavalink', playerNotifier: { syncPanel: vi.fn().mockResolvedValue(undefined) } },
		audio: { getPlayer: vi.fn(() => player), players: { get: vi.fn(() => player) } },
		mixerService: {
			clearNext: vi.fn().mockResolvedValue(undefined),
			setAutomix: vi.fn().mockResolvedValue(undefined),
			setSilence: vi.fn().mockResolvedValue(undefined),
			preloadUpcoming: vi.fn().mockResolvedValue(undefined),
			setNormalization: vi.fn().mockResolvedValue(undefined)
		},
		aiChat: { acquireChannelTurn: vi.fn(() => true), releaseChannelTurn: vi.fn() },
		aiChatHistory: { clearChannelHistory: vi.fn().mockResolvedValue(undefined) },
		countingState: { reset: vi.fn().mockResolvedValue(undefined) },
		sponsorBlockService: { refreshSettings: vi.fn() },
		tempVoiceService: { setupMarkerChannel: vi.fn().mockResolvedValue(undefined) },
		redisStore: { publish: vi.fn() },
		logger: { warn: vi.fn(), error: vi.fn() }
	};
	const handler = new SettingsInteractionHandler({} as never, {} as never) as unknown as {
		container: unknown;
		run: (i: unknown, a: { action: string }) => Promise<void>;
	};
	handler.container = services;
	return { handler, services, player };
}

async function run(action: string, interaction: ReturnType<typeof makeInteraction>, guild?: Record<string, unknown>) {
	const ctx = setup(guild);
	await ctx.handler.run(interaction, { action });
	return ctx;
}

const lastMode = () => vi.mocked(settingsView).mock.calls.at(-1)![1];

describe('settings 액션 표', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(checkManageGuild).mockReturnValue(true);
	});

	it('표의 모든 항목이 settingsId 액션과 일치해요 (모달 ID 제외)', () => {
		const actions = Object.keys(SETTINGS_ACTIONS).sort();
		expect(actions).toHaveLength(34);
		for (const action of actions) expect(settingsId.decode(settingsId.encode(action as 'back'))?.action).toBe(action);
	});

	it('권한이 없으면 안내만 보내고 아무것도 바꾸지 않아요', async () => {
		vi.mocked(checkManageGuild).mockReturnValue(false);
		const interaction = makeInteraction('button');
		await run('toggleController', interaction);
		expect(interaction.reply).toHaveBeenCalledTimes(1);
		expect(interaction.deferUpdate).not.toHaveBeenCalled();
		expect(guildPlayback.setEnableController).not.toHaveBeenCalled();
	});

	it('jtcTemplate은 deferUpdate 없이 모달만 열어요', async () => {
		vi.mocked(guildJtc.getJtcSettings).mockResolvedValue({ template: '{user}' } as never);
		const interaction = makeInteraction('button');
		await run('jtcTemplate', interaction);
		expect(interaction.showModal).toHaveBeenCalledTimes(1);
		expect(interaction.deferUpdate).not.toHaveBeenCalled();
		expect(interaction.editReply).not.toHaveBeenCalled();
	});

	it('navigate는 고른 화면으로, 알 수 없는 값이나 다른 컴포넌트면 메인으로 그려요', async () => {
		await run('navigate', makeInteraction('string', ['dj']));
		expect(lastMode()).toBe('dj');
		for (const page of ['music', 'audio', 'sponsorblock', 'ai', 'chatTools']) {
			await run('navigate', makeInteraction('string', [page]));
			expect(lastMode()).toBe(page);
		}
		await run('navigate', makeInteraction('string', ['nope']));
		expect(lastMode()).toBe('main');
		await run('navigate', makeInteraction('button'));
		expect(lastMode()).toBe('main');
		await run('back', makeInteraction('button'));
		expect(lastMode()).toBe('main');
	});

	it('마지막에는 deferUpdate 뒤 같은 payload로 화면을 다시 그려요', async () => {
		const interaction = makeInteraction('button');
		await run('toggleController', interaction);
		expect(interaction.deferUpdate.mock.invocationCallOrder[0]).toBeLessThan(interaction.editReply.mock.invocationCallOrder[0]!);
		expect(interaction.editReply).toHaveBeenCalledWith({
			components: ['VIEW'],
			flags: [expect.anything()],
			allowedMentions: { roles: [], users: [] }
		});
		expect(settingsView).toHaveBeenCalledWith(GUILD, 'music', { channelId: undefined });
	});

	it('selectModules는 선택하지 않은 끌 수 있는 모듈을 꺼짐으로 저장하고 무효화를 알려요 (관리 모듈은 보내지 않아요)', async () => {
		const { services } = await run('selectModules', makeInteraction('string', ['music', 'community', 'ai', 'utility']));
		expect(guildModules.setDisabledModules).toHaveBeenCalledWith(services.guildService, 'g1', ['fun']);
		expect(services.redisStore.publish).toHaveBeenCalledWith(
			'sirubot:guild-settings:invalidate',
			JSON.stringify({ guildId: 'g1' }),
			expect.any(String)
		);
		expect(lastMode()).toBe('main');
	});

	it('selectModules에서 모두 해제하면 끌 수 있는 모듈 전부를 꺼요', async () => {
		await run('selectModules', makeInteraction('string', []));
		expect(guildModules.setDisabledModules).toHaveBeenCalledWith(expect.anything(), 'g1', ['music', 'community', 'ai', 'fun', 'utility']);
	});

	it('selectModules는 셀렉트가 아니면 아무것도 저장하지 않아요', async () => {
		await run('selectModules', makeInteraction('button'));
		expect(guildModules.setDisabledModules).not.toHaveBeenCalled();
	});

	it('toggleController는 컨트롤러 설정을 뒤집어요', async () => {
		const { services } = await run('toggleController', makeInteraction('button'));
		expect(guildPlayback.setEnableController).toHaveBeenCalledWith(services.guildService, 'g1', false);
	});

	it('toggleRelated는 켤 때 재생 중이고 대기열이 비었으면 다음 추천을 미리 넣어요', async () => {
		vi.mocked(queueRelatedUpfront).mockResolvedValue(undefined as never);
		const { services, player } = await run('toggleRelated', makeInteraction('button'));
		expect(guildPlayback.setRelated).toHaveBeenCalledWith(services.guildService, 'g1', true);
		expect(queueRelatedUpfront).toHaveBeenCalledWith(expect.objectContaining({ marker: 'lavalink' }), player, player.queue.current);
	});

	it('toggleRelated를 끌 때는 미리 넣지 않아요', async () => {
		await run('toggleRelated', makeInteraction('button'), { ...GUILD, related: true });
		expect(guildPlayback.setRelated).toHaveBeenCalledWith(expect.anything(), 'g1', false);
		expect(queueRelatedUpfront).not.toHaveBeenCalled();
	});

	it('toggleRepeat는 off -> track -> queue -> off로 돌고 플레이어와 mixer를 갱신해요', async () => {
		for (const [from, to] of [
			['off', 'track'],
			['track', 'queue'],
			['queue', 'off']
		]) {
			vi.clearAllMocks();
			const { services, player } = await run('toggleRepeat', makeInteraction('button'), { ...GUILD, repeat: from });
			expect(guildPlayback.setRepeat).toHaveBeenCalledWith(services.guildService, 'g1', to);
			expect(player.setRepeatMode).toHaveBeenCalledWith(to);
			expect(services.mixerService.clearNext).toHaveBeenCalledWith(player);
			expect(vi.mocked(guildPlayback.setRepeat).mock.invocationCallOrder[0]).toBeLessThan(player.setRepeatMode.mock.invocationCallOrder[0]!);
		}
	});

	it('toggleDeleteInput는 입력 삭제 설정을 뒤집어요', async () => {
		const { services } = await run('toggleDeleteInput', makeInteraction('button'));
		expect(guildChannels.setTextChannelDeleteInput).toHaveBeenCalledWith(services.guildService, 'g1', true);
		expect(lastMode()).toBe('channel');
	});

	it('toggleJtc는 켜져 있거나 마커 채널이 있을 때만 뒤집어요', async () => {
		vi.mocked(guildJtc.getJtcSettings).mockResolvedValue({ enabled: false, markerChannelId: null } as never);
		await run('toggleJtc', makeInteraction('button'));
		expect(guildJtc.setJtcEnabled).not.toHaveBeenCalled();
		vi.mocked(guildJtc.getJtcSettings).mockResolvedValue({ enabled: false, markerChannelId: 'm' } as never);
		await run('toggleJtc', makeInteraction('button'));
		expect(guildJtc.setJtcEnabled).toHaveBeenLastCalledWith(expect.anything(), 'g1', true);
		vi.mocked(guildJtc.getJtcSettings).mockResolvedValue({ enabled: true, markerChannelId: null } as never);
		await run('toggleJtc', makeInteraction('button'));
		expect(guildJtc.setJtcEnabled).toHaveBeenLastCalledWith(expect.anything(), 'g1', false);
	});

	it('selectJtcCategory는 마커 채널을 만들고, 실패하면 로그와 ephemeral 안내를 남겨요', async () => {
		const ok = await run('selectJtcCategory', makeInteraction('channel', ['cat']));
		expect(ok.services.tempVoiceService.setupMarkerChannel).toHaveBeenCalledWith('g1', 'cat');
		const interaction = makeInteraction('channel', ['cat']);
		const ctx = setup();
		ctx.services.tempVoiceService.setupMarkerChannel.mockRejectedValue(new Error('x'));
		await ctx.handler.run(interaction, { action: 'selectJtcCategory' });
		expect(ctx.services.logger.error).toHaveBeenCalledTimes(1);
		expect(interaction.followUp).toHaveBeenCalledTimes(1);
		expect(interaction.editReply).toHaveBeenCalledTimes(1);
	});

	it('selectJtcLimit은 숫자로 바꿔 저장해요', async () => {
		await run('selectJtcLimit', makeInteraction('string', ['5']));
		expect(guildJtc.setJtcUserLimit).toHaveBeenCalledWith(expect.anything(), 'g1', 5);
	});

	it('selectSponsorblock과 resetSponsorblock은 저장한 뒤 플레이어 설정을 새로 읽어요', async () => {
		const a = await run('selectSponsorblock', makeInteraction('string', ['sponsor', 'intro']));
		expect(guildPlayback.setSponsorBlockSegments).toHaveBeenCalledWith(a.services.guildService, 'g1', ['sponsor', 'intro']);
		expect(a.services.sponsorBlockService.refreshSettings).toHaveBeenCalledWith(a.player);
		vi.clearAllMocks();
		const b = await run('resetSponsorblock', makeInteraction('button'));
		expect(guildPlayback.setSponsorBlockSegments).toHaveBeenCalledWith(b.services.guildService, 'g1', []);
		expect(b.services.sponsorBlockService.refreshSettings).toHaveBeenCalledWith(b.player);
	});

	it('DJ 역할을 고르거나 지워요', async () => {
		await run('selectDj', makeInteraction('role', ['r1']));
		expect(guildPlayback.setDJRole).toHaveBeenLastCalledWith(expect.anything(), 'g1', 'r1');
		await run('removeDj', makeInteraction('button'));
		expect(guildPlayback.setDJRole).toHaveBeenLastCalledWith(expect.anything(), 'g1', null);
	});

	it('채널 선택과 제거가 각 설정에 닿아요', async () => {
		const g = expect.anything();
		const text = await run('selectText', makeInteraction('channel', ['t']));
		expect(guildChannels.setDefaultTextChannel).toHaveBeenLastCalledWith(g, 'g1', 't');
		expect(text.services.lavalink.playerNotifier.syncPanel).toHaveBeenCalledTimes(1);
		await run('selectVoice', makeInteraction('channel', ['v']));
		expect(guildChannels.setDefaultVoiceChannel).toHaveBeenLastCalledWith(g, 'g1', 'v');
		const removed = await run('removeText', makeInteraction('button'));
		expect(guildChannels.setDefaultTextChannel).toHaveBeenLastCalledWith(g, 'g1', null);
		expect(removed.services.lavalink.playerNotifier.syncPanel).toHaveBeenCalledTimes(1);
		await run('removeVoice', makeInteraction('button'));
		expect(guildChannels.setDefaultVoiceChannel).toHaveBeenLastCalledWith(g, 'g1', null);
	});

	it('selectInputMode는 select일 때만 select, 그 외는 play예요', async () => {
		await run('selectInputMode', makeInteraction('string', ['select']));
		expect(guildChannels.setTextChannelMode).toHaveBeenLastCalledWith(expect.anything(), 'g1', 'select');
		await run('selectInputMode', makeInteraction('string', ['whatever']));
		expect(guildChannels.setTextChannelMode).toHaveBeenLastCalledWith(expect.anything(), 'g1', 'play');
	});

	it('컴포넌트 종류가 맞지 않으면 아무것도 바꾸지 않고 화면만 다시 그려요', async () => {
		const wrong: [string, Kind][] = [
			['selectDj', 'channel'],
			['selectText', 'role'],
			['selectVoice', 'string'],
			['selectInputMode', 'channel'],
			['selectJtcCategory', 'string'],
			['selectJtcLimit', 'channel'],
			['selectSponsorblock', 'role']
		];
		for (const [action, kind] of wrong) {
			vi.clearAllMocks();
			const interaction = makeInteraction(kind, ['x']);
			const { services } = await run(action, interaction);
			expect(guildChannels.setDefaultTextChannel, action).not.toHaveBeenCalled();
			expect(guildChannels.setDefaultVoiceChannel, action).not.toHaveBeenCalled();
			expect(guildChannels.setTextChannelMode, action).not.toHaveBeenCalled();
			expect(guildJtc.setJtcUserLimit, action).not.toHaveBeenCalled();
			expect(guildPlayback.setDJRole, action).not.toHaveBeenCalled();
			expect(guildPlayback.setSponsorBlockSegments, action).not.toHaveBeenCalled();
			expect(services.tempVoiceService.setupMarkerChannel, action).not.toHaveBeenCalled();
			expect(interaction.editReply, action).toHaveBeenCalledTimes(1);
		}
	});
});

describe('설정 액션 표: 믹서·AI·채팅 유틸 페이지 (구 /믹서 /채팅설정 /채팅유틸)', () => {
	const MIXER = { gaplessEnabled: true, normalizationEnabled: false, automixEnabled: false, crossfadeEnabled: false };

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(checkManageGuild).mockReturnValue(true);
		vi.mocked(guildMixer.getMixerSettings).mockResolvedValue(MIXER as never);
		vi.mocked(guildMixer.setTransitionMode).mockResolvedValue({ ...MIXER, automixEnabled: true } as never);
	});

	it('selectTransition은 저장 뒤 재생 중 플레이어에 적용하고 audio를 다시 그려요', async () => {
		const { services, player } = await run('selectTransition', makeInteraction('string', ['automix']));
		expect(guildMixer.setTransitionMode).toHaveBeenCalledWith(services.guildService, 'g1', 'automix');
		expect(services.mixerService.setAutomix).toHaveBeenCalledWith(player, expect.objectContaining({ automixEnabled: true }));
		expect(lastMode()).toBe('audio');
	});

	it('selectTransition은 모르는 값을 저장하지 않아요', async () => {
		await run('selectTransition', makeInteraction('string', ['nope']));
		expect(guildMixer.setTransitionMode).not.toHaveBeenCalled();
	});

	it('플레이어 적용에 실패하면 저장은 유지하고 경고 안내를 따로 보내요', async () => {
		const interaction = makeInteraction('string', ['automix']);
		const ctx = setup();
		ctx.services.mixerService.setAutomix.mockRejectedValue(new Error('unsupported'));
		await ctx.handler.run(interaction, { action: 'selectTransition' });
		expect(guildMixer.setTransitionMode).toHaveBeenCalled();
		expect(interaction.editReply).toHaveBeenCalledTimes(1);
		expect(JSON.stringify(interaction.followUp.mock.calls)).toContain('설정은 저장했지만');
	});

	it('플레이어가 없으면 적용 없이 안내도 없어요', async () => {
		const interaction = makeInteraction('string', ['crossfade']);
		const ctx = setup();
		ctx.services.audio.getPlayer.mockReturnValue(undefined as never);
		await ctx.handler.run(interaction, { action: 'selectTransition' });
		expect(ctx.services.mixerService.setAutomix).not.toHaveBeenCalled();
		expect(interaction.followUp).not.toHaveBeenCalled();
	});

	it('toggleGapless는 값을 뒤집고 플레이어의 무음·예열을 맞춰요', async () => {
		const { services, player } = await run('toggleGapless', makeInteraction('button'));
		expect(guildMixer.setGapless).toHaveBeenCalledWith(services.guildService, 'g1', false);
		expect(services.mixerService.setSilence).toHaveBeenCalledWith(player, false);
		expect(services.mixerService.clearNext).toHaveBeenCalledWith(player, { force: true });
		vi.clearAllMocks();
		vi.mocked(guildMixer.getMixerSettings).mockResolvedValue({ ...MIXER, gaplessEnabled: false } as never);
		const on = await run('toggleGapless', makeInteraction('button'));
		expect(guildMixer.setGapless).toHaveBeenCalledWith(on.services.guildService, 'g1', true);
		expect(on.services.mixerService.preloadUpcoming).toHaveBeenCalledWith(on.player, { force: true });
	});

	it('toggleNormalization은 값을 뒤집고 플레이어에 적용해요', async () => {
		const { services, player } = await run('toggleNormalization', makeInteraction('button'));
		expect(guildMixer.setNormalization).toHaveBeenCalledWith(services.guildService, 'g1', true);
		expect(services.mixerService.setNormalization).toHaveBeenCalledWith(player, true);
	});

	it('selectAnnounceMode는 알 수 없는 값을 기본 방식으로 정규화해 저장해요', async () => {
		vi.mocked(guildPlayback.normalizeAnnounceMode).mockImplementation(((v: string) => (v === 'parallel' ? 'parallel' : 'sequential')) as never);
		await run('selectAnnounceMode', makeInteraction('string', ['parallel']));
		expect(guildPlayback.setTtsAnnounceMode).toHaveBeenLastCalledWith(expect.anything(), 'g1', 'parallel');
	});

	it('editCrossfade와 editAutomix는 deferUpdate 없이 모달만 열어요', async () => {
		vi.mocked(guildMixer.getMixerSettings).mockResolvedValue({
			crossfadeMs: 5000,
			automixMaxTempoChange: 0.06,
			automixMinConfidence: 0.3
		} as never);
		for (const action of ['editCrossfade', 'editAutomix']) {
			const interaction = makeInteraction('button');
			await run(action, interaction);
			expect(interaction.showModal, action).toHaveBeenCalledTimes(1);
			expect(interaction.deferUpdate, action).not.toHaveBeenCalled();
		}
	});

	it('selectAiMode는 서버 모드를 저장하고 컴포넌트 종류가 다르면 무시해요', async () => {
		const { services } = await run('selectAiMode', makeInteraction('string', ['off']));
		expect(guildChatPolicy.setAiMode).toHaveBeenCalledWith(services.guildService, 'g1', 'off');
		expect(lastMode()).toBe('ai');
		vi.clearAllMocks();
		await run('selectAiMode', makeInteraction('button'));
		expect(guildChatPolicy.setAiMode).not.toHaveBeenCalled();
	});

	it('resetAiHistory는 확인을 받은 뒤 패널 채널의 기록을 지워요', async () => {
		vi.mocked(confirmAction).mockResolvedValue(true);
		const interaction = makeInteraction('button');
		interaction.channelId = 'c1';
		const { services } = await run('resetAiHistory', interaction);
		expect(services.aiChat.acquireChannelTurn).toHaveBeenCalledWith('c1');
		expect(services.aiChatHistory.clearChannelHistory).toHaveBeenCalledWith('c1');
		expect(services.aiChat.releaseChannelTurn).toHaveBeenCalledWith('c1');
		expect(interaction.followUp).toHaveBeenCalledTimes(1);
	});

	it('resetAiHistory는 취소하면 지우지 않고, 답변 중이면 안내만 해요', async () => {
		vi.mocked(confirmAction).mockResolvedValue(false);
		const cancel = await run('resetAiHistory', makeInteraction('button'));
		expect(cancel.services.aiChatHistory.clearChannelHistory).not.toHaveBeenCalled();
		vi.mocked(confirmAction).mockResolvedValue(true);
		const interaction = makeInteraction('button');
		const ctx = setup();
		ctx.services.aiChat.acquireChannelTurn.mockReturnValue(false);
		await ctx.handler.run(interaction, { action: 'resetAiHistory' });
		expect(ctx.services.aiChatHistory.clearChannelHistory).not.toHaveBeenCalled();
		expect(JSON.stringify(interaction.followUp.mock.calls)).toContain('답변 중');
	});

	it('채팅 유틸 토글은 패널 채널 기준으로 켜짐 상태를 뒤집어요', async () => {
		vi.mocked(guildChatPolicy.getChatToolSettings).mockResolvedValue({
			emojiEnlarge: { mode: 'off', channelIds: [] },
			quote: { mode: 'all', channelIds: [] },
			embedFix: { mode: 'channels', channelIds: ['c1'] }
		} as never);
		const expected = { toggleEmojiEnlarge: ['emojiEnlarge', true], toggleQuote: ['quote', false], toggleEmbedFix: ['embedFix', false] } as const;
		for (const [action, [tool, enable]] of Object.entries(expected)) {
			const interaction = makeInteraction('button');
			interaction.channelId = 'c1';
			const { services } = await run(action, interaction);
			expect(guildChatPolicy.setChannelChatToolEnabled, action).toHaveBeenLastCalledWith(services.guildService, 'g1', tool, 'c1', enable, []);
			expect(lastMode()).toBe('chatTools');
		}
	});

	it('카운팅 채널 지정과 끄기는 기록을 새로 시작해요', async () => {
		const set = await run('selectCountingChannel', makeInteraction('channel', ['ch9']));
		expect(guildChatPolicy.setCountingChannel).toHaveBeenCalledWith(set.services.guildService, 'g1', 'ch9');
		expect(set.services.countingState.reset).toHaveBeenCalledWith('g1');
		const off = await run('disableCounting', makeInteraction('button'));
		expect(guildChatPolicy.setCountingEnabled).toHaveBeenCalledWith(off.services.guildService, 'g1', false);
		expect(off.services.countingState.reset).toHaveBeenCalledWith('g1');
	});
});
