import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ButtonInteraction } from 'discord.js';
import { filterCustomIdPrefix, filterView } from '../view/filter.ts';
import { CustomPlayer } from '../lavalink/player/customPlayer.ts';
import { checkDJOrAlone } from '../utils/permissionCheck.ts';

export default class FilterInteractionHandler extends InteractionHandler {
	public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(ctx, {
			...options,
			interactionHandlerType: InteractionHandlerTypes.Button
		});
	}

	public override parse(interaction: ButtonInteraction) {
		if (!interaction.inCachedGuild()) return this.none();
		if (!interaction.customId.startsWith(filterCustomIdPrefix)) return this.none();

		const action = interaction.customId.replace(filterCustomIdPrefix, '');
		return this.some({ action });
	}

	public async run(interaction: ButtonInteraction<'cached'>, { action }: { action: string }) {
		// DJ/Alone 권한 체크
		if (!(await checkDJOrAlone(interaction.guildId, interaction.member))) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral],
				content: '🔇 필터 변경은 DJ 역할이 있거나 채널에 혼자 있을 때만 가능해요.'
			});
			return;
		}

		const player = this.container.audio.getPlayer(interaction.guildId) as CustomPlayer | undefined;
		if (!player) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral],
				content: '❌ 현재 재생 중인 플레이어가 없어요.'
			});
			return;
		}

		if (action === 'reset') {
			await player.filterManager.resetFilters();
			await player.filterManager.clearEQ();
			player.activeFilters = [];
			await interaction.update({
				components: [filterView({ activeFilters: [] })],
				flags: [MessageFlags.IsComponentsV2]
			});
			return;
		}
	}
}
