import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ButtonInteraction, type StringSelectMenuInteraction, ComponentType } from 'discord.js';
import { filterCustomIdPrefix, filterView } from '../view/filter.ts';
import { CustomPlayer } from '../lavalink/player/customPlayer.ts';
import { checkDJOrAlone } from '../utils/permissionCheck.ts';

export default class FilterInteractionHandler extends InteractionHandler {
	public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(ctx, {
			...options,
			interactionHandlerType: InteractionHandlerTypes.SelectMenu | InteractionHandlerTypes.Button
		});
	}

	public override parse(interaction: StringSelectMenuInteraction | ButtonInteraction) {
		if (!interaction.inCachedGuild()) return this.none();
		if (!interaction.customId.startsWith(filterCustomIdPrefix)) return this.none();

		const action = interaction.customId.replace(filterCustomIdPrefix, '');
		return this.some({ action });
	}

	public async run(interaction: StringSelectMenuInteraction<'cached'> | ButtonInteraction<'cached'>, { action }: { action: string }) {
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

		if (action === 'select' && interaction.componentType === ComponentType.StringSelect) {
			const selectInteraction = interaction as StringSelectMenuInteraction<'cached'>;
			const selectedPresets = selectInteraction.values;

			// 전체 초기화 후 선택된 필터만 적용
			await player.filterManager.resetFilters();
			await player.filterManager.clearEQ();
			for (const preset of selectedPresets) {
				await this.applyPreset(player, preset);
			}
			player.activeFilters = selectedPresets;

			await selectInteraction.update({
				components: [filterView({ activeFilters: selectedPresets })],
				flags: [MessageFlags.IsComponentsV2]
			});
		}
	}

	private async applyPreset(player: CustomPlayer, preset: string) {
		switch (preset) {
			case 'bassboost':
				await player.filterManager.setEQ([
					{ band: 0, gain: 0.6 },
					{ band: 1, gain: 0.7 },
					{ band: 2, gain: 0.8 },
					{ band: 3, gain: 0.55 },
					{ band: 4, gain: 0.25 }
				]);
				break;
			case 'nightcore':
				await player.filterManager.toggleNightcore(1.3, 1.3, 1);
				break;
			case 'vaporwave':
				await player.filterManager.toggleVaporwave(0.8, 0.8, 1);
				break;
			case '8d':
				await player.filterManager.toggleRotation(0.2);
				break;
			case 'karaoke':
				await player.filterManager.toggleKaraoke(1.0, 1.0, 220, 100);
				break;
		}
	}
}
