import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type StringSelectMenuInteraction } from 'discord.js';
import { filterView } from '../views/filter.ts';
import { filterId } from '../customIds.ts';
import { CustomPlayer } from '../../lavalink/player/customPlayer.ts';
import { applyFilterPreset, dropLoserFilters, resetAllFilters } from '../utils/filterPresets.ts';
import { GUARD_MESSAGES, guardPlayerAccess } from '../utils/interactionGuards.ts';

export default class FilterInteractionHandler extends InteractionHandler {
	public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(ctx, {
			...options,
			interactionHandlerType: InteractionHandlerTypes.SelectMenu
		});
	}

	public override parse(interaction: StringSelectMenuInteraction) {
		if (!interaction.inCachedGuild()) return this.none();
		if (filterId.decode(interaction.customId)?.action !== 'select') return this.none();
		return this.some();
	}

	public async run(interaction: StringSelectMenuInteraction<'cached'>) {
		const player = await guardPlayerAccess(
			interaction,
			this.container.audio.getPlayer(interaction.guildId) as CustomPlayer | undefined,
			GUARD_MESSAGES.djOnlyFilter
		);
		if (!player) return;

		const selectedPresets = interaction.values;

		await resetAllFilters(player);

		const results = await Promise.allSettled(selectedPresets.map((preset) => applyFilterPreset(player, preset)));
		const failed = results.filter((r) => r.status === 'rejected');
		if (failed.length > 0) {
			this.container.logger.error(
				`Failed to apply ${failed.length} filter(s):`,
				failed.map((r) => (r as PromiseRejectedResult).reason)
			);
		}

		// nightcore/vaporwave는 timescale을 공유하므로 덮어써진/실패한 프리셋은 UI에서 제외한다.
		const succeededPresets = selectedPresets.filter((_, i) => results[i].status === 'fulfilled');
		const activePresets = dropLoserFilters(succeededPresets);

		player.activeFilters = activePresets;

		await interaction.update({
			components: [filterView({ activeFilters: activePresets })],
			flags: [MessageFlags.IsComponentsV2]
		});
	}
}
