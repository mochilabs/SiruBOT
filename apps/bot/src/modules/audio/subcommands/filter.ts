import { container } from '@sapphire/framework';
import { emoji } from '@sirubot/utils';
import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { CustomPlayer } from '../lavalink/player/customPlayer.ts';
import * as view from '../view/filter.ts';

export const name = 'filter';
export const ko = '필터';
export const description = '오디오 필터를 적용하거나 해제해요.';
export const preconditions = ['TextChannelAllowed', 'NodeAvailable', 'VoiceConnected', 'SameVoiceChannel', 'SongPlaying', 'DJOrAlone'];

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub
		.setName(name)
		.setNameLocalizations({ ko })
		.setDescription(description)
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

function getActiveFilters(player: CustomPlayer): string[] {
	return player.activeFilters;
}

async function applyPreset(player: CustomPlayer, preset: string): Promise<void> {
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

export async function run(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
	const player = container.audio.getPlayer(interaction.guildId) as CustomPlayer | undefined;
	if (!player) return;

	const preset = interaction.options.getString('preset');

	// 프리셋 없으면 현재 필터 상태 UI 표시
	if (!preset) {
		const activeFilters = getActiveFilters(player);
		await interaction.reply({
			components: [view.filterView({ activeFilters })],
			flags: [MessageFlags.IsComponentsV2]
		});
		return;
	}

	// 초기화
	if (preset === 'reset') {
		await player.filterManager.resetFilters();
		await player.filterManager.clearEQ();
		// resetFilters()가 mixer 플러그인 키도 지우므로 다시 삽입
		await container.mixerService.reapplyMixerFilter(player);
		player.activeFilters = [];
		await interaction.reply({
			components: [view.filterApplied({ filters: [] })],
			flags: [MessageFlags.IsComponentsV2]
		});
		return;
	}

	// 프리셋 토글
	const activeFilters = getActiveFilters(player);
	const isActive = activeFilters.includes(preset);

	if (isActive) {
		// 필터 해제 — 전체 초기화 후 남은 필터만 다시 적용
		const newFilters = activeFilters.filter((f) => f !== preset);
		await player.filterManager.resetFilters();
		await player.filterManager.clearEQ();
		await container.mixerService.reapplyMixerFilter(player);

		await Promise.all(newFilters.map((filter) => applyPreset(player, filter)));

		player.activeFilters = newFilters;
		await interaction.reply({
			components: [view.filterApplied({ filters: newFilters })],
			flags: [MessageFlags.IsComponentsV2]
		});
	} else {
		// 필터 적용
		await applyPreset(player, preset);
		let newFilters = [...activeFilters, preset];
		// nightcore/vaporwave는 timescale을 공유해 하나를 켜면 Lavalink가 다른 쪽을 자동으로 끈다.
		// 남은 쪽을 그대로 두면 응답 표시와 실제 플레이어 상태가 어긋난다.
		if (preset === 'nightcore') newFilters = newFilters.filter((f) => f !== 'vaporwave');
		if (preset === 'vaporwave') newFilters = newFilters.filter((f) => f !== 'nightcore');
		player.activeFilters = newFilters;
		await interaction.reply({
			components: [view.filterApplied({ filters: newFilters })],
			flags: [MessageFlags.IsComponentsV2]
		});
	}
}
