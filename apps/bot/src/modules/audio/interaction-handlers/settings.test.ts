import { beforeEach, describe, expect, it, vi } from 'vitest';
import { settingsId } from '../customIds.ts';
import SettingsInteractionHandler, { SETTINGS_ACTIONS } from './settings.ts';
import * as guildChannels from '../../../services/guildSettings/channels.ts';
import * as guildJtc from '../../../services/guildSettings/jtc.ts';
import * as guildPlayback from '../../../services/guildSettings/playback.ts';
import { queueRelatedUpfront } from '../../../features/music/lavalink/autoPlayRelated.ts';
import { checkManageGuild } from '../utils/permissionCheck.ts';
import { settingsView } from '../view/settings.ts';

vi.mock('@sapphire/framework', () => ({
	InteractionHandler: class {
		some = (value?: unknown) => ({ isSome: () => true, unwrap: () => value });
		none = () => ({ isSome: () => false });
	},
	InteractionHandlerTypes: { MessageComponent: 'message-component' },
	container: {}
}));
vi.mock('../../../services/guildSettings/channels.ts');
vi.mock('../../../services/guildSettings/jtc.ts');
vi.mock('../../../services/guildSettings/playback.ts');
vi.mock('../../../features/music/lavalink/autoPlayRelated.ts', () => ({ queueRelatedUpfront: vi.fn() }));
vi.mock('../utils/permissionCheck.ts', () => ({ checkManageGuild: vi.fn(() => true) }));
vi.mock('../view/settings.ts', async (importOriginal) => ({ ...(await importOriginal<object>()), settingsView: vi.fn(() => 'VIEW') }));

type Kind = 'button' | 'string' | 'role' | 'channel';

function makeInteraction(kind: Kind, values: string[] = []) {
	return {
		guildId: 'g1',
		member: {},
		values,
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

const GUILD = { enableController: true, related: false, repeat: 'off', pinnedChannelDeleteInput: false };

function setup(guild: Record<string, unknown> = GUILD) {
	const player = { playing: true, queue: { current: { info: {} }, tracks: [] as unknown[] }, setRepeatMode: vi.fn() };
	const services = {
		guildService: { getGuild: vi.fn().mockResolvedValue(guild) },
		audio: { getPlayer: vi.fn(() => player), players: { get: vi.fn(() => player) } },
		mixerService: { clearNext: vi.fn().mockResolvedValue(undefined) },
		sponsorBlockService: { refreshSettings: vi.fn() },
		tempVoiceService: { setupMarkerChannel: vi.fn().mockResolvedValue(undefined) },
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
		expect(actions).toHaveLength(21);
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
		expect(settingsView).toHaveBeenCalledWith(GUILD, 'music');
	});

	it('toggleController는 컨트롤러 설정을 뒤집어요', async () => {
		const { services } = await run('toggleController', makeInteraction('button'));
		expect(guildPlayback.setEnableController).toHaveBeenCalledWith(services.guildService, 'g1', false);
	});

	it('toggleRelated는 켤 때 재생 중이고 대기열이 비었으면 다음 추천을 미리 넣어요', async () => {
		vi.mocked(queueRelatedUpfront).mockResolvedValue(undefined as never);
		const { services, player } = await run('toggleRelated', makeInteraction('button'));
		expect(guildPlayback.setRelated).toHaveBeenCalledWith(services.guildService, 'g1', true);
		expect(queueRelatedUpfront).toHaveBeenCalledWith(player, player.queue.current);
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

	it('togglePinDelete는 입력 삭제 설정을 뒤집어요', async () => {
		const { services } = await run('togglePinDelete', makeInteraction('button'));
		expect(guildChannels.setPinnedChannelDeleteInput).toHaveBeenCalledWith(services.guildService, 'g1', true);
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
		await run('selectText', makeInteraction('channel', ['t']));
		expect(guildChannels.setDefaultTextChannel).toHaveBeenLastCalledWith(g, 'g1', 't');
		await run('selectVoice', makeInteraction('channel', ['v']));
		expect(guildChannels.setDefaultVoiceChannel).toHaveBeenLastCalledWith(g, 'g1', 'v');
		await run('selectPin', makeInteraction('channel', ['p']));
		expect(guildChannels.setPinnedChannel).toHaveBeenLastCalledWith(g, 'g1', 'p');
		await run('removeText', makeInteraction('button'));
		expect(guildChannels.setDefaultTextChannel).toHaveBeenLastCalledWith(g, 'g1', null);
		await run('removeVoice', makeInteraction('button'));
		expect(guildChannels.setDefaultVoiceChannel).toHaveBeenLastCalledWith(g, 'g1', null);
		await run('removePin', makeInteraction('button'));
		expect(guildChannels.setPinnedChannel).toHaveBeenLastCalledWith(g, 'g1', null);
	});

	it('selectPinMode는 select일 때만 select, 그 외는 play예요', async () => {
		await run('selectPinMode', makeInteraction('string', ['select']));
		expect(guildChannels.setPinnedChannelMode).toHaveBeenLastCalledWith(expect.anything(), 'g1', 'select');
		await run('selectPinMode', makeInteraction('string', ['whatever']));
		expect(guildChannels.setPinnedChannelMode).toHaveBeenLastCalledWith(expect.anything(), 'g1', 'play');
	});

	it('컴포넌트 종류가 맞지 않으면 아무것도 바꾸지 않고 화면만 다시 그려요', async () => {
		const wrong: [string, Kind][] = [
			['selectDj', 'channel'],
			['selectText', 'role'],
			['selectVoice', 'string'],
			['selectPin', 'button'],
			['selectPinMode', 'channel'],
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
			expect(guildChannels.setPinnedChannel, action).not.toHaveBeenCalled();
			expect(guildChannels.setPinnedChannelMode, action).not.toHaveBeenCalled();
			expect(guildJtc.setJtcUserLimit, action).not.toHaveBeenCalled();
			expect(guildPlayback.setDJRole, action).not.toHaveBeenCalled();
			expect(guildPlayback.setSponsorBlockSegments, action).not.toHaveBeenCalled();
			expect(services.tempVoiceService.setupMarkerChannel, action).not.toHaveBeenCalled();
			expect(interaction.editReply, action).toHaveBeenCalledTimes(1);
		}
	});
});
