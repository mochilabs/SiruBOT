import { container } from '@sapphire/framework';
import { FILTER_PRESETS } from '../views/filter.ts';
import type { CustomPlayer } from '../../lavalink/player/customPlayer.ts';

export const FILTER_PRESET_NAMES: string[] = FILTER_PRESETS.map((preset) => preset.name);

export function isFilterPreset(value: string): boolean {
	return FILTER_PRESET_NAMES.includes(value);
}

export async function applyFilterPreset(player: CustomPlayer, preset: string): Promise<void> {
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

/** resetFilters()는 mixer 플러그인 키까지 지우므로 재삽입이 필수다. */
export async function resetAllFilters(player: CustomPlayer): Promise<void> {
	await player.filterManager.resetFilters();
	await player.filterManager.clearEQ();
	await container.mixerService.reapplyMixerFilter(player);
}

/** nightcore/vaporwave는 timescale을 공유하므로 뒤에 온 쪽만 남긴다. */
export function dropLoserFilters(filters: string[]): string[] {
	const hasNightcore = filters.includes('nightcore');
	const hasVaporwave = filters.includes('vaporwave');
	if (!hasNightcore || !hasVaporwave) return filters;
	const last = filters.lastIndexOf('nightcore') > filters.lastIndexOf('vaporwave') ? 'nightcore' : 'vaporwave';
	return filters.filter((filter) => filter !== (last === 'nightcore' ? 'vaporwave' : 'nightcore'));
}
