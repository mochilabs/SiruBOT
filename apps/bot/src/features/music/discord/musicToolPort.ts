import { actorFromMember } from '../application/actor.ts';
import type { MusicToolPort } from '../application/musicToolPort.ts';
import type { LavalinkDeps } from '../lavalink/deps.ts';
import { getUserQueuedTracks, queueRelatedUpfront, removeStaleRelatedTracks } from '../lavalink/autoPlayRelated.ts';
import { isSameTrack } from '../lavalink/handlers/playbackWatchdog.ts';
import { nowPlayingTrack } from '../lavalink/player/nowPlaying.ts';
import { applyFilterPreset, dropLoserFilters, FILTER_PRESET_NAMES, isFilterPreset, resetAllFilters } from './utils/filterPresets.ts';
import { checkDJOrAlone, checkManageGuild } from './utils/permissionCheck.ts';
import { parseTimeToMs } from './utils/timeParse.ts';

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
