import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError, container } from '@sapphire/framework';
import { emoji } from '@sirubot/utils';
import {
	ApplicationIntegrationType,
	ChatInputCommandInteraction,
	MessageFlags,
	type SlashCommandSubcommandGroupBuilder,
	type SlashCommandSubcommandsOnlyBuilder
} from 'discord.js';
import { CustomPlayer } from '../lavalink/player/customPlayer.ts';
import * as view from '../view/mixer.ts';

/**
 * 믹서 서브커맨드 정의 — `/믹서`와 `/설정 믹서`가 같은 옵션을 써야 해서 한 곳에 둬요.
 */
export function withMixerSubcommands(builder: SlashCommandSubcommandsOnlyBuilder | SlashCommandSubcommandGroupBuilder): void {
	builder
		.addSubcommand((sub) =>
			sub
				.setName('status')
				.setNameLocalizations({ ko: '상태' })
				.setDescription('Show mixer settings and state.')
				.setDescriptionLocalizations({ ko: '믹서 설정과 상태를 보여줘요.' })
		)
		.addSubcommand((sub) =>
			sub
				.setName('gapless')
				.setNameLocalizations({ ko: '갭리스' })
				.setDescription('Toggle gapless playback.')
				.setDescriptionLocalizations({ ko: '갭리스 재생을 켜거나 꺼요.' })
				.addBooleanOption((opt) =>
					opt.setName('enabled').setNameLocalizations({ ko: '켜기' }).setDescription('갭리스 재생을 켤지 끌지 선택해요.').setRequired(true)
				)
		)
		.addSubcommand((sub) =>
			sub
				.setName('crossfade')
				.setNameLocalizations({ ko: '크로스페이드' })
				.setDescription('Toggle overlap crossfade.')
				.setDescriptionLocalizations({ ko: '곡 사이 겹치기(크로스페이드)를 설정해요.' })
				.addBooleanOption((opt) =>
					opt.setName('enabled').setNameLocalizations({ ko: '켜기' }).setDescription('크로스페이드를 켤지 끌지 선택해요.').setRequired(true)
				)
				.addIntegerOption((opt) =>
					opt
						.setName('duration')
						.setNameLocalizations({ ko: '길이' })
						.setDescription('겹치는 길이 500~15000ms (0.5초~15초). 생략하면 현재 값을 유지해요.')
						.setMinValue(500)
						.setMaxValue(15000)
						.setRequired(false)
				)
		)
		.addSubcommand((sub) =>
			sub
				.setName('normalization')
				.setNameLocalizations({ ko: '볼륨정규화' })
				.setDescription('Toggle volume normalization.')
				.setDescriptionLocalizations({ ko: '곡 사이 볼륨 차이를 자동으로 맞춰요.' })
				.addBooleanOption((opt) =>
					opt.setName('enabled').setNameLocalizations({ ko: '켜기' }).setDescription('볼륨 정규화를 켤지 끌지 선택해요.').setRequired(true)
				)
		)
		.addSubcommand((sub) =>
			sub
				.setName('parallel-tts')
				.setNameLocalizations({ ko: '동시tts' })
				.setDescription('Toggle simultaneous TTS announcements.')
				.setDescriptionLocalizations({ ko: '여러 음성 안내를 동시에 재생할지 설정해요.' })
				.addBooleanOption((opt) =>
					opt.setName('enabled').setNameLocalizations({ ko: '켜기' }).setDescription('동시 재생을 켤지 끌지 선택해요.').setRequired(true)
				)
		);
}

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'mixer',
	description: '갭리스 재생과 크로스페이드를 설정해요.',
	fullCategory: ['음악'],
	preconditions: ['TextChannelAllowed', 'NodeAvailable', 'VoiceConnected', 'SameVoiceChannel']
})
export class MixerCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '믹서' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '갭리스 재생과 크로스페이드를 설정해요.' });
			withMixerSubcommands(builder);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) return;

		await interaction.deferReply();

		const player = this.container.audio.getPlayer(interaction.guildId) as CustomPlayer | undefined;

		const subcommand = interaction.options.getSubcommand(true);
		switch (subcommand) {
			case 'status':
				return this.handleStatus(interaction, player);
			case 'gapless':
				return this.handleGapless(interaction, player);
			case 'crossfade':
				return this.handleCrossfade(interaction, player);
			case 'normalization':
				return this.handleNormalization(interaction, player);
			case 'parallel-tts':
				return this.handleParallelTts(interaction);
			default:
				throw new UserError({
					identifier: 'mixer_unknown_subcommand',
					message: `${emoji('error')} 알 수 없는 하위 명령어예요.`,
					context: { ephemeral: true }
				});
		}
	}

	/**
	 * `/설정 믹서` 같은 다른 커맨드가 같은 핸들러를 쓰도록 위임해요.
	 * 인스턴스는 서브커맨드/플레이어만 쓰므로 커맨드 컨텍스트 없이 만들어도 안전해요.
	 */
	static async runFor(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
		const command = new MixerCommand(container.client as never);
		const player = container.audio.getPlayer(interaction.guildId) as CustomPlayer | undefined;
		const subcommand = interaction.options.getSubcommand(true);

		switch (subcommand) {
			case 'status':
				return command.handleStatus(interaction, player);
			case 'gapless':
				return command.handleGapless(interaction, player);
			case 'crossfade':
				return command.handleCrossfade(interaction, player);
			case 'normalization':
				return command.handleNormalization(interaction, player);
			case 'parallel-tts':
				return command.handleParallelTts(interaction);
			default:
				throw new UserError({
					identifier: 'mixer_unknown_subcommand',
					message: `${emoji('error')} 알 수 없는 하위 명령어예요.`,
					context: { ephemeral: true }
				});
		}
	}

	async handleStatus(interaction: ChatInputCommandInteraction<'cached'>, player?: CustomPlayer) {
		const settings = await this.container.guildService.getMixerSettings(interaction.guildId);
		const state = player ? await this.container.mixerService.getState(player).catch(() => null) : null;
		await interaction.editReply({
			components: [view.mixerStatus({ settings, state, noPlayer: !player })],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { roles: [], users: [] }
		});
	}

	async checkDJ(interaction: ChatInputCommandInteraction<'cached'>) {
		const allowed = await this.container.guildService.hasDJRole(interaction.guildId, interaction.member);
		if (!allowed) {
			throw new UserError({
				identifier: 'mixer_no_permission',
				message: `${emoji('error')} 믹서 설정을 바꾸려면 DJ 역할이나 관리자 권한이 필요해요.`,
				context: { ephemeral: true }
			});
		}
	}

	async handleGapless(interaction: ChatInputCommandInteraction<'cached'>, player?: CustomPlayer) {
		await this.checkDJ(interaction);
		const enabled = interaction.options.getBoolean('enabled', true);
		await this.container.guildService.setGapless(interaction.guildId, enabled);
		if (player) {
			if (!enabled) await this.container.mixerService.clearNext(player, { force: true }).catch(() => null);
			else await this.container.mixerService.preloadUpcoming(player, { force: true }).catch(() => null);
		}
		let message: string;
		if (player) {
			if (enabled) message = `${emoji('arrow_forward')} 갭리스 재생을 켰어요. 다음 곡부터 끊김 없이 이어져요.`;
			else message = `${emoji('arrow_forward')} 갭리스 재생을 껐어요.`;
		} else if (enabled) message = `${emoji('arrow_forward')} 갭리스 재생을 켰어요. 다음에 재생할 때부터 끊김 없이 이어져요.`;
		else message = `${emoji('arrow_forward')} 갭리스 재생을 껐어요. 다음에 재생할 때부터 적용돼요.`;
		await interaction.editReply({
			components: [view.mixerUpdated({ message })],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { roles: [], users: [] }
		});
	}

	async handleCrossfade(interaction: ChatInputCommandInteraction<'cached'>, player?: CustomPlayer) {
		await this.checkDJ(interaction);
		const enabled = interaction.options.getBoolean('enabled', true);
		const duration = interaction.options.getInteger('duration') ?? undefined;
		const saved = await this.container.guildService.setCrossfade(interaction.guildId, enabled, duration);
		if (player) {
			try {
				await this.container.mixerService.setCrossfade(player, saved.crossfadeEnabled, saved.crossfadeMs);
			} catch {
				throw new UserError({
					identifier: 'mixer_crossfade_failed',
					message: `${emoji('tools')} 크로스페이드 설정 전달에 실패했어요. Lavalink 서버에 mixer 플러그인이 켜져 있는지 확인해 주세요.`,
					context: { ephemeral: true }
				});
			}
		}
		const base = saved.crossfadeEnabled
			? `${emoji('shuffle')} 크로스페이드를 켰어요. (${(saved.crossfadeMs / 1000).toFixed(1)}초 겹치기)`
			: `${emoji('shuffle')} 크로스페이드를 껐어요.`;
		await interaction.editReply({
			components: [
				view.mixerUpdated({
					message: player ? base : `${base} 다음에 재생할 때부터 적용돼요.`
				})
			],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { roles: [], users: [] }
		});
	}

	async handleNormalization(interaction: ChatInputCommandInteraction<'cached'>, player?: CustomPlayer) {
		await this.checkDJ(interaction);
		const enabled = interaction.options.getBoolean('enabled', true);
		await this.container.guildService.setNormalization(interaction.guildId, enabled);
		if (player) {
			try {
				await this.container.mixerService.setNormalization(player, enabled);
			} catch {
				throw new UserError({
					identifier: 'mixer_normalization_failed',
					message: `${emoji('tools')} 볼륨 정규화 설정 전달에 실패했어요. Lavalink 서버에 mixer 플러그인이 켜져 있는지 확인해 주세요.`,
					context: { ephemeral: true }
				});
			}
		}
		const message = enabled
			? `${emoji('arrow_forward')} 볼륨 정규화를 켰어요. 첫 곡 기준으로 다음 곡들의 볼륨을 맞춰요.`
			: `${emoji('arrow_forward')} 볼륨 정규화를 껐어요.`;
		await interaction.editReply({
			components: [
				view.mixerUpdated({
					message: player ? message : `${message} 다음에 재생할 때부터 적용돼요.`
				})
			],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { roles: [], users: [] }
		});
	}

	async handleParallelTts(interaction: ChatInputCommandInteraction<'cached'>) {
		await this.checkDJ(interaction);
		const enabled = interaction.options.getBoolean('enabled', true);
		await this.container.guildService.setTtsParallel(interaction.guildId, enabled);
		const message = enabled
			? `${emoji('volume_up')} 동시 TTS를 켰어요. 여러 음성 안내가 동시에 재생돼요.`
			: `${emoji('volume_up')} 동시 TTS를 껐어요. 음성 안내가 순서대로 재생돼요.`;
		await interaction.editReply({
			components: [view.mixerUpdated({ message })],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { roles: [], users: [] }
		});
	}
}
