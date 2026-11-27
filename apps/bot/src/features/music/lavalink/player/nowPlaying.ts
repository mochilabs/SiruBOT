import { Track } from 'lavalink-client';
import { CustomPlayer } from './customPlayer.ts';

/** Prefer trackStart-confirmed track over queue.current, which lavalink-client shifts mid-transition. */
export function nowPlayingTrack(player: CustomPlayer): Track | null {
	return player.transitionState?.confirmedNowPlaying ?? (player.queue?.current as Track | null) ?? null;
}
