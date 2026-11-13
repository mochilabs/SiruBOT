import { Track } from 'lavalink-client';
import { CustomPlayer } from './customPlayer.ts';

/**
 * NOWPLAYING 표시의 단일 소스 — trackStart로 확정된 트랙을 먼저 쓴다.
 *
 * `queue.current`는 lavalink-client의 전이 기계(지연 shift, queueEnd의 자동 추천
 * 시프트)가 수시로 덮어쓰므로 표시 근거로 쓰지 않는다. 확정값이 아직 없는
 * 복구 시작 등에서는 current로 대체한다.
 */
export function nowPlayingTrack(player: CustomPlayer): Track | null {
	return player.transitionState?.confirmedNowPlaying ?? (player.queue?.current as Track | null) ?? null;
}
