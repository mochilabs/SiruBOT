import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { appEmoji } from '@sirubot/utils';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { CustomPlayer } from '../lavalink/player/customPlayer.ts';
import * as view from '../view/mixer.ts';

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
				.setDescriptionLocalizations({ ko: '갭리스 재생과 크로스페이드를 설정해요.' })
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
							opt
								.setName('enabled')
								.setNameLocalizations({ ko: '켜기' })
								.setDescription('갭리스 재생을 켤지 끌지 선택해요.')
								.setRequired(true)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('crossfade')
						.setNameLocalizations({ ko: '크로스페이드' })
						.setDescription('Toggle overlap crossfade.')
						.setDescriptionLocalizations({ ko: '곡 사이 겹치기(크로스페이드)를 설정해요.' })
						.addBooleanOption((opt) =>
							opt
								.setName('enabled')
								.setNameLocalizations({ ko: '켜기' })
								.setDescription('크로스페이드를 켤지 끌지 선택해요.')
								.setRequired(true)
						)
						.addIntegerOption((opt) =>
							opt
								.setName('duration')
								.setNameLocalizations({ ko: '길이' })
								.setDescription('겹치는 길이 (500-30000ms). 생략하면 현재 값을 유지해요.')
								.setMinValue(500)
								.setMaxValue(30000)
								.setRequired(false)
						)
				);
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
			default:
				throw new UserError({
					identifier: 'mixer_unknown_subcommand',
					message: `${appEmoji('error', '❌')} 알 수 없는 하위 명령어예요.`,
					context: { ephemeral: true }
				});
		}
	}

	private async handleStatus(interaction: ChatInputCommandInteraction<'cached'>, player?: CustomPlayer) {
		const settings = await this.container.guildService.getMixerSettings(interaction.guildId);
		const state = player ? await this.container.mixerService.getState(player).catch(() => null) : null;
		await interaction.editReply({
			components: [view.mixerStatus({ settings, state, noPlayer: !player })],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { roles: [], users: [] }
		});
	}

	private async checkDJ(interaction: ChatInputCommandInteraction<'cached'>) {
		const allowed = await this.container.guildService.hasDJRole(interaction.guildId, interaction.member);
		if (!allowed) {
			throw new UserError({
				identifier: 'mixer_no_permission',
				message: `${appEmoji('error', '❌')} 믹서 설정을 바꾸려면 DJ 역할이나 관리자 권한이 필요해요.`,
				context: { ephemeral: true }
			});
		}
	}

	private async handleGapless(interaction: ChatInputCommandInteraction<'cached'>, player?: CustomPlayer) {
		await this.checkDJ(interaction);
		const enabled = interaction.options.getBoolean('enabled', true);
		await this.container.guildService.setGapless(interaction.guildId, enabled);
		if (player) {
			if (!enabled) await this.container.mixerService.clearNext(player).catch(() => null);
			else await this.container.mixerService.preloadUpcoming(player).catch(() => null);
		}
		let message: string;
		if (player) {
			if (enabled) message = `${appEmoji('arrow_forward', '⏭️')} 갭리스 재생을 켰어요. 다음 곡부터 끊김 없이 이어져요.`;
			else message = `${appEmoji('arrow_forward', '⏭️')} 갭리스 재생을 껐어요.`;
		} else if (enabled) message = `${appEmoji('arrow_forward', '⏭️')} 갭리스 재생을 켰어요. 다음에 재생할 때부터 끊김 없이 이어져요.`;
		else message = `${appEmoji('arrow_forward', '⏭️')} 갭리스 재생을 껐어요. 다음에 재생할 때부터 적용돼요.`;
		await interaction.editReply({
			components: [view.mixerUpdated({ message })],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { roles: [], users: [] }
		});
	}

	private async handleCrossfade(interaction: ChatInputCommandInteraction<'cached'>, player?: CustomPlayer) {
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
					message: `${appEmoji('tools', '🛠️')} 크로스페이드 설정 전달에 실패했어요. Lavalink 서버에 mixer 플러그인이 켜져 있는지 확인해 주세요.`,
					context: { ephemeral: true }
				});
			}
		}
		const base = saved.crossfadeEnabled
			? `${appEmoji('shuffle', '🔀')} 크로스페이드를 켰어요. (${saved.crossfadeMs}ms 겹치기)`
			: `${appEmoji('shuffle', '🔀')} 크로스페이드를 껐어요.`;
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
}
