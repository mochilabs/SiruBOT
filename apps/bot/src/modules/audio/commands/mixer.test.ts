import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageFlags, SlashCommandBuilder, SlashCommandSubcommandGroupBuilder } from 'discord.js';
import { MixerCommand, withMixerSubcommands } from './mixer.ts';
import type { CustomPlayer } from '../lavalink/player/customPlayer.ts';

const mocks = vi.hoisted(() => ({
	guildService: {
		hasDJRole: vi.fn(),
		setAutomix: vi.fn(),
		setTransitionMode: vi.fn(),
		setGapless: vi.fn(),
		getMixerSettings: vi.fn(),
		setCrossfadeDuration: vi.fn()
	},
	mixerService: { setAutomix: vi.fn(), setSilence: vi.fn(), clearNext: vi.fn(), preloadUpcoming: vi.fn() },
	audio: { getPlayer: vi.fn() }
}));
vi.mock('@sapphire/decorators', () => ({ ApplyOptions: () => () => undefined }));
vi.mock('@sapphire/framework', () => ({
	Command: class {
		container = mocks;
	},
	container: mocks,
	UserError: class extends Error {
		identifier: string;
		constructor(options: { identifier: string; message: string }) {
			super(options.message);
			this.identifier = options.identifier;
		}
	}
}));
vi.mock('../lavalink/player/customPlayer.ts', () => ({ CustomPlayer: class {} }));
vi.mock('@sirubot/utils', () => ({ DEFAULT_COLOR: 0, emoji: (name: string) => name }));

const saved = {
	gaplessEnabled: true,
	crossfadeEnabled: true,
	crossfadeMs: 5000,
	normalizationEnabled: false,
	automixEnabled: true,
	automixMaxTempoChange: 0.06,
	automixMinConfidence: 0.3
};

function interaction(opts: { mode?: string; tempo?: number | null; confidence?: number | null } = {}) {
	return {
		guildId: 'guild',
		member: {},
		inCachedGuild: () => true,
		deferReply: vi.fn().mockResolvedValue(undefined),
		editReply: vi.fn().mockResolvedValue(undefined),
		options: {
			getSubcommand: () => 'transition',
			getString: () => opts.mode ?? 'automix',
			getNumber: (name: string) => (name === 'max-tempo-change' ? (opts.tempo ?? null) : (opts.confidence ?? null))
		}
	};
}

describe('Mixer transition command', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.guildService.hasDJRole.mockResolvedValue(true);
		mocks.guildService.setAutomix.mockResolvedValue(saved);
		mocks.guildService.getMixerSettings.mockResolvedValue(saved);
		mocks.guildService.setTransitionMode.mockResolvedValue(saved);
	});

	it('routes off/crossfade as one atomic settings update', async () => {
		const input = interaction({ mode: 'crossfade' });
		mocks.guildService.setTransitionMode.mockResolvedValue({ ...saved, automixEnabled: false });
		await Reflect.apply(MixerCommand.runFor, MixerCommand, [input]);
		expect(mocks.guildService.setTransitionMode).toHaveBeenCalledWith('guild', 'crossfade');
		expect(mocks.guildService.setAutomix).not.toHaveBeenCalled();
	});

	it('registers the same bounded options for mixer and settings audio on transition', () => {
		for (const builder of [
			new SlashCommandBuilder().setName('mixer').setDescription('Mixer'),
			new SlashCommandSubcommandGroupBuilder().setName('audio').setDescription('Audio')
		]) {
			withMixerSubcommands(builder);
			const options = builder.toJSON().options as Array<{ name: string; options?: unknown[] }>;
			expect(options).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						name: 'tuning',
						options: expect.arrayContaining([
							expect.objectContaining({ name: 'max-tempo-change', min_value: 0, max_value: 12 }),
							expect.objectContaining({ name: 'min-confidence', min_value: 0, max_value: 1 })
						])
					})
				])
			);
			expect(options).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'automix' })]));
		}
	});

	it('AutoMix mode defers and saves percent as a ratio before applying to the player', async () => {
		const input = interaction({ mode: 'automix', tempo: 6, confidence: 0.4 });
		input.options.getSubcommand = () => 'tuning';
		const player = {};
		mocks.audio.getPlayer.mockReturnValue(player);
		const command = Object.create(MixerCommand.prototype, { container: { value: mocks } });
		await Reflect.apply(MixerCommand.prototype.chatInputRun, command, [input]);
		expect(mocks.guildService.setAutomix).toHaveBeenCalledWith('guild', true, 0.06, 0.4);
		expect(mocks.mixerService.setAutomix).toHaveBeenCalledWith(player, saved);
		expect(input.deferReply.mock.invocationCallOrder[0]).toBeLessThan(mocks.guildService.setAutomix.mock.invocationCallOrder[0]!);
		expect(mocks.guildService.setAutomix.mock.invocationCallOrder[0]).toBeLessThan(mocks.mixerService.setAutomix.mock.invocationCallOrder[0]!);
		expect(input.editReply).toHaveBeenCalledWith(expect.objectContaining({ flags: [MessageFlags.IsComponentsV2] }));
	});

	it('routes settings audio and preserves omitted options without a player', async () => {
		const input = interaction({ mode: 'automix' });
		await Reflect.apply(MixerCommand.runFor, MixerCommand, [input]);
		expect(mocks.guildService.setTransitionMode).toHaveBeenCalledWith('guild', 'automix');
		expect(mocks.mixerService.setAutomix).not.toHaveBeenCalled();
		expect(JSON.stringify(input.editReply.mock.calls)).toContain('다음 재생부터 적용돼요');
	});

	it('rejects non-DJs before saving', async () => {
		mocks.guildService.hasDJRole.mockResolvedValue(false);
		await expect(Reflect.apply(MixerCommand.runFor, MixerCommand, [interaction({ mode: 'automix' })])).rejects.toMatchObject({
			identifier: 'mixer_no_permission'
		});
		expect(mocks.guildService.setAutomix).not.toHaveBeenCalled();
	});

	it('reports that settings were saved when AutoMix runtime application fails', async () => {
		mocks.audio.getPlayer.mockReturnValue({});
		mocks.mixerService.setAutomix.mockRejectedValue(new Error('unsupported'));
		await expect(Reflect.apply(MixerCommand.runFor, MixerCommand, [interaction({ mode: 'automix' })])).rejects.toMatchObject({
			identifier: 'mixer_automix_failed',
			message: expect.stringContaining('설정은 저장했지만')
		});
	});
});

describe('Mixer gapless command', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.guildService.hasDJRole.mockResolvedValue(true);
		mocks.mixerService.setSilence.mockResolvedValue({});
		mocks.mixerService.preloadUpcoming.mockResolvedValue(undefined);
		mocks.mixerService.clearNext.mockResolvedValue(undefined);
	});

	it('syncs silence when toggling gapless with an active player', async () => {
		const player = {} as unknown as CustomPlayer;
		mocks.audio.getPlayer.mockReturnValue(player);
		const cmd = new MixerCommand({} as unknown as ConstructorParameters<typeof MixerCommand>[0], { name: 'mixer' });
		const input = {
			guildId: 'guild',
			member: {},
			inCachedGuild: () => true,
			deferReply: vi.fn().mockResolvedValue(undefined),
			editReply: vi.fn().mockResolvedValue(undefined),
			options: {
				getBoolean: () => true
			}
		};
		await cmd.handleGapless(input as unknown as Parameters<typeof cmd.handleGapless>[0], player);
		expect(mocks.guildService.setGapless).toHaveBeenCalledWith('guild', true);
		expect(mocks.mixerService.setSilence).toHaveBeenCalledWith(player, true);
		expect(mocks.mixerService.preloadUpcoming).toHaveBeenCalledWith(player, { force: true });
	});
});
