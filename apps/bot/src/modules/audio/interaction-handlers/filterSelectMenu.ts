import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { emoji } from '@sirubot/utils';
import { MessageFlags, type StringSelectMenuInteraction } from 'discord.js';
import { filterCustomIdPrefix, filterView } from '../view/filter.ts';
import { errorView } from '../../../lib/errorView.ts';
import { CustomPlayer } from '../lavalink/player/customPlayer.ts';
import { applyFilterPreset, dropLoserFilters, resetAllFilters } from '../utils/filterPresets.ts';
import { checkDJOrAlone } from '../utils/permissionCheck.ts';

export default class FilterInteractionHandler extends InteractionHandler {
	public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(ctx, {
			...options,
			interactionHandlerType: InteractionHandlerTypes.SelectMenu
		});
	}

	public override parse(interaction: StringSelectMenuInteraction) {
		if (!interaction.inCachedGuild()) return this.none();
		if (!interaction.customId.startsWith(filterCustomIdPrefix)) return this.none();

		const action = interaction.customId.replace(filterCustomIdPrefix, '');
		return this.some({ action });
	}

	public async run(interaction: StringSelectMenuInteraction<'cached'>, { action }: { action: string }) {
		// DJ/Alone 권한 체크
		if (!(await checkDJOrAlone(interaction.guildId, interaction.member))) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView(`${emoji('volume_muted')} 필터 변경은 DJ 역할이 있거나 채널에 혼자 있을 때만 가능해요.`)]
			});
			return;
		}

		const player = this.container.audio.getPlayer(interaction.guildId) as CustomPlayer | undefined;
		if (!player) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView(`${emoji('error')} 현재 재생 중인 플레이어가 없어요.`)]
			});
			return;
		}

		if (action === 'select') {
			const selectedPresets = interaction.values;

			// 전체 초기화 후 선택된 필터만 적용
			await resetAllFilters(player);

			const results = await Promise.allSettled(selectedPresets.map((preset) => applyFilterPreset(player, preset)));
			const failed = results.filter((r) => r.status === 'rejected');
			if (failed.length > 0) {
				this.container.logger.error(
					`Failed to apply ${failed.length} filter(s):`,
					failed.map((r) => (r as PromiseRejectedResult).reason)
				);
			}

			// nightcore/vaporwave는 timescale을 공유해 나중에 적용된 쪽만 살아남는다.
			// 실패한 프리셋과 덮어써진 프리셋을 UI에 그대로 두면 실제 상태와 어긋난다.
			const succeededPresets = selectedPresets.filter((_, i) => results[i].status === 'fulfilled');
			const activePresets = dropLoserFilters(succeededPresets);

			player.activeFilters = activePresets;

			await interaction.update({
				components: [filterView({ activeFilters: activePresets })],
				flags: [MessageFlags.IsComponentsV2]
			});
		}
	}
}
