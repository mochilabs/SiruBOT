import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ButtonInteraction } from 'discord.js';
import { filterCustomIdPrefix, filterView } from '../view/filter.ts';
import { CustomPlayer } from '../lavalink/player/customPlayer.ts';
import { GUARD_MESSAGES, guardPlayerAccess } from '../utils/interactionGuards.ts';

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
		const player = await guardPlayerAccess(
			interaction,
			this.container.audio.getPlayer(interaction.guildId) as CustomPlayer | undefined,
			GUARD_MESSAGES.djOnlyFilter
		);
		if (!player) return;

		if (action === 'reset') {
			await player.filterManager.resetFilters();
			await player.filterManager.clearEQ();
			await this.container.mixerService.reapplyMixerFilter(player);
			player.activeFilters = [];
			await interaction.update({
				components: [filterView({ activeFilters: [] })],
				flags: [MessageFlags.IsComponentsV2]
			});
			return;
		}
	}
}
