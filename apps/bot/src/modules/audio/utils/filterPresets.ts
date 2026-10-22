import { container } from '@sapphire/framework';
import { FILTER_PRESETS } from '../view/filter.ts';
import type { CustomPlayer } from '../lavalink/player/customPlayer.ts';

/**
 * 오디오 필터 프리셋 적용 규칙의 단일 원본 — `/필터` 커맨드, 필터 셀렉트 메뉴,
 * AI 도구(music_filter)가 각각 사본을 갖고 있어 한쪽만 수정되면 경로마다
 * 다른 필터 결과가 나왔다(EQ 게인·timescale 파라미터·mixer 재삽입·상호 배제 규칙).
 */

/** 프리셋으로 취급하는 이름 목록 — 뷰의 프리셋 카탈로그(라벨·이모지 포함)에서 뽑는다. reset은 별도 동작. */
export const FILTER_PRESET_NAMES: string[] = FILTER_PRESETS.map((preset) => preset.name);

/** 프리셋이 등록된 필터 이름인지 판별해요 (reset·미등록값은 거부). */
export function isFilterPreset(value: string): boolean {
	return FILTER_PRESET_NAMES.includes(value);
}

/**
 * 프리셋 1종을 플레이어에 적용해요. 알 수 없는 프리셋은 조용히 무시합니다
 * (호출부가 이미 목록으로 검증한 뒤 부르기 때문이에요).
 */
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

/**
 * 모든 필터를 비우고 mixer 플러그인 키를 되살려요.
 * `resetFilters()`는 mixer 플러그인 키까지 지우므로 어느 경로에서든 재삽입이 필수예요.
 */
export async function resetAllFilters(player: CustomPlayer): Promise<void> {
	await player.filterManager.resetFilters();
	await player.filterManager.clearEQ();
	await container.mixerService.reapplyMixerFilter(player);
}

/**
 * nightcore/vaporwave는 timescale을 공유해 둘 다 켜면 Lavalink가 나중 적용분만 남깁니다.
 * 목록·플레이어 상태가 어긋나지 않도록 뒤에 온 쪽만 남겨요.
 */
export function dropLoserFilters(filters: string[]): string[] {
	const hasNightcore = filters.includes('nightcore');
	const hasVaporwave = filters.includes('vaporwave');
	if (!hasNightcore || !hasVaporwave) return filters;
	const last = filters.lastIndexOf('nightcore') > filters.lastIndexOf('vaporwave') ? 'nightcore' : 'vaporwave';
	return filters.filter((filter) => filter !== (last === 'nightcore' ? 'vaporwave' : 'nightcore'));
}
