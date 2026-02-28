import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type StringSelectMenuInteraction } from 'discord.js';
import { controllerView } from '../view/controller.ts';
import { CustomPlayer } from '../lavalink/player/customPlayer.ts';
import { errorView } from '../view/error.ts';

export default class ControllerSelectMenuHandler extends InteractionHandler {
	public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(ctx, {
			...options,
			interactionHandlerType: InteractionHandlerTypes.SelectMenu
		});
	}

	public override parse(interaction: StringSelectMenuInteraction) {
		if (!interaction.inCachedGuild()) return this.none();
		if (interaction.customId === 'controller:queue:select') {
			return this.some({ selectedValue: interaction.values[0] });
		}
		return this.none();
	}

	public async run(interaction: StringSelectMenuInteraction<'cached'>, { selectedValue }: { selectedValue: string }) {
		// 음성 채널 참여 체크
		const memberVoice = interaction.member.voice.channel;
		const player = this.container.audio.getPlayer(interaction.guildId) as CustomPlayer | undefined;

		if (!memberVoice || (player && memberVoice.id !== player.voiceChannelId)) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView('🔇 봇과 같은 음성 채널에 있어야 사용할 수 있어요.')]
			});
			return;
		}

		if (!player) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView('❌ 현재 재생 중인 플레이어가 없어요.')]
			});
			return;
		}

		const trackIndex = parseInt(selectedValue, 10) - 1;
		if (isNaN(trackIndex) || trackIndex < 0 || trackIndex >= player.queue.tracks.length) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView('❌ 유효하지 않은 트랙 번호에요.')]
			});
			return;
		}

		// Update the controller view to reflect the selection (no action taken on select, just UI update)
		await interaction.update({
			components: [controllerView({ player, volume: player.volume, page: player.queuePage })],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { roles: [], users: [] }
		});
	}
}
