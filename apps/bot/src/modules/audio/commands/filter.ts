import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import * as view from '../view/filter.ts';
import { CustomPlayer } from '../lavalink/player/customPlayer.ts';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'filter',
	description: '오디오 필터를 적용하거나 해제해요.',
	fullCategory: ['음악'],
	preconditions: ['TextChannelAllowed', 'NodeAvailable', 'VoiceConnected', 'SameVoiceChannel', 'SongPlaying', 'DJOrAlone']
})
export class FilterCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '필터' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '오디오 필터를 적용하거나 해제해요.' })
				.addStringOption((option) =>
					option
						.setName('preset')
						.setNameLocalizations({ ko: '프리셋' })
						.setDescription('Select a filter preset to toggle.')
						.setDescriptionLocalizations({ ko: '적용할 필터 프리셋을 선택해요.' })
						.addChoices(
							...view.FILTER_PRESETS.map((preset) => ({
								name: `${preset.emoji} ${preset.label}`,
								name_localizations: { ko: `${preset.emoji} ${preset.label}` },
								value: preset.name
							})),
							{ name: '🔄 초기화', name_localizations: { ko: '🔄 초기화' }, value: 'reset' }
						)
				);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) return;

		const player = this.container.audio.getPlayer(interaction.guildId) as CustomPlayer | undefined;
		if (!player) return;

		const preset = interaction.options.getString('preset');

		// 프리셋 없으면 현재 필터 상태 UI 표시
		if (!preset) {
			const activeFilters = this.getActiveFilters(player);
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
			player.activeFilters = [];
			await interaction.reply({
				components: [view.filterApplied({ filters: [] })],
				flags: [MessageFlags.IsComponentsV2]
			});
			return;
		}

		// 프리셋 토글
		const activeFilters = this.getActiveFilters(player);
		const isActive = activeFilters.includes(preset);

		if (isActive) {
			// 필터 해제 — 전체 초기화 후 남은 필터만 다시 적용
			const newFilters = activeFilters.filter((f) => f !== preset);
			await player.filterManager.resetFilters();
			await player.filterManager.clearEQ();
			for (const filter of newFilters) {
				await this.applyPreset(player, filter);
			}
			player.activeFilters = newFilters;
			await interaction.reply({
				components: [view.filterApplied({ filters: newFilters })],
				flags: [MessageFlags.IsComponentsV2]
			});
		} else {
			// 필터 적용
			await this.applyPreset(player, preset);
			const newFilters = [...activeFilters, preset];
			player.activeFilters = newFilters;
			await interaction.reply({
				components: [view.filterApplied({ filters: newFilters })],
				flags: [MessageFlags.IsComponentsV2]
			});
		}
	}

	private getActiveFilters(player: CustomPlayer): string[] {
		return player.activeFilters;
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
