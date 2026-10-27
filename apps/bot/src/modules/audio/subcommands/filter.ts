import { container } from '@sapphire/framework';
import { emoji } from '@sirubot/utils';
import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { CustomPlayer } from '../lavalink/player/customPlayer.ts';
import { applyFilterPreset, dropLoserFilters, resetAllFilters } from '../utils/filterPresets.ts';
import * as view from '../view/filter.ts';

export const name = 'filter';
export const ko = '필터';
export const description = '오디오 필터를 적용하거나 해제해요.';
/** en-US 기본 설명 (기본 로케일이 영어예요) */
export const descriptionEn = 'Apply or clear an audio filter preset.';
export const preconditions = ['TextChannelAllowed', 'NodeAvailable', 'VoiceConnected', 'SameVoiceChannel', 'SongPlaying', 'DJOrAlone'];

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub
		.setName(name)
		.setNameLocalizations({ ko })
		.setDescription(descriptionEn)
		.setDescriptionLocalizations({ ko: description })
		.addStringOption((option) =>
			option
				.setName('preset')
				.setNameLocalizations({ ko: '프리셋' })
				.setDescription('Select a filter preset to toggle.')
				.setDescriptionLocalizations({ ko: '적용할 필터 프리셋을 선택해요.' })
				.addChoices(
					...view.FILTER_PRESETS.map((preset) => ({
						name: `${view.filterPresetEmoji(preset)} ${preset.label}`,
						name_localizations: { ko: `${view.filterPresetEmoji(preset)} ${preset.label}` },
						value: preset.name
					})),
					{ name: `${emoji('repeat')} 초기화`, name_localizations: { ko: `${emoji('repeat')} 초기화` }, value: 'reset' }
				)
		);
}

export async function run(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
	const player = container.audio.getPlayer(interaction.guildId) as CustomPlayer | undefined;
	if (!player) return;

	const preset = interaction.options.getString('preset');

	// 프리셋 없으면 현재 필터 상태 UI 표시
	if (!preset) {
		const activeFilters = player.activeFilters;
		await interaction.reply({
			components: [view.filterView({ activeFilters })],
			flags: [MessageFlags.IsComponentsV2]
		});
		return;
	}

	// 초기화
	if (preset === 'reset') {
		await resetAllFilters(player);
		player.activeFilters = [];
		await interaction.reply({
			components: [view.filterApplied({ filters: [] })],
			flags: [MessageFlags.IsComponentsV2]
		});
		return;
	}

	// 프리셋 토글
	const activeFilters = player.activeFilters;
	const isActive = activeFilters.includes(preset);

	if (isActive) {
		// 필터 해제 — 전체 초기화 후 남은 필터만 다시 적용
		const newFilters = activeFilters.filter((f) => f !== preset);
		await resetAllFilters(player);

		await Promise.all(newFilters.map((filter) => applyFilterPreset(player, filter)));

		player.activeFilters = newFilters;
		await interaction.reply({
			components: [view.filterApplied({ filters: newFilters })],
			flags: [MessageFlags.IsComponentsV2]
		});
	} else {
		// 필터 적용
		await applyFilterPreset(player, preset);
		const newFilters = dropLoserFilters([...activeFilters, preset]);
		player.activeFilters = newFilters;
		await interaction.reply({
			components: [view.filterApplied({ filters: newFilters })],
			flags: [MessageFlags.IsComponentsV2]
		});
	}
}
