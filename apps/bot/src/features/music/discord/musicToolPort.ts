import { actorFromMember } from '../application/actor.ts';
import type { MusicToolPort } from '../application/musicToolPort.ts';
import type { LavalinkDeps } from '../lavalink/deps.ts';
import { getUserQueuedTracks, queueRelatedUpfront, removeStaleRelatedTracks } from '../lavalink/autoPlayRelated.ts';
import { isSameTrack } from '../lavalink/handlers/playbackWatchdog.ts';
import { nowPlayingTrack } from '../lavalink/player/nowPlaying.ts';
import { applyFilterPreset, dropLoserFilters, FILTER_PRESET_NAMES, isFilterPreset, resetAllFilters } from './utils/filterPresets.ts';
import { checkDJOrAlone, checkManageGuild } from './utils/permissionCheck.ts';
import { parseTimeToMs } from './utils/timeParse.ts';

/**
 * AI 도구 포트 구현 (BotApplication.setupServices가 한 번 만들어요).
 * 헬퍼를 이 한 곳에서 묶어 노출하고, lavalink 의존성은 자동 추천곡 정리·선예열에만 써요.
 */
export function createMusicToolPort(deps: { lavalink: LavalinkDeps }): MusicToolPort {
	return {
		actorFromMember,
		checkDJOrAlone,
		checkManageGuild,
		nowPlayingTrack,
		isSameTrack,
		getUserQueuedTracks,
		removeStaleRelatedTracks: (player) => removeStaleRelatedTracks(deps.lavalink, player),
		queueRelatedUpfront: (player, track) => queueRelatedUpfront(deps.lavalink, player, track),
		parseTimeToMs,
		filterPresetNames: FILTER_PRESET_NAMES,
		isFilterPreset,
		applyFilterPreset,
		dropLoserFilters,
		resetAllFilters
	};
}
