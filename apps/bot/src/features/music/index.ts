/**
 * 음악 기능의 공개 표면. 다른 feature나 core/services는 이 파일을 통해서만 들어와요.
 * (슬래시·버튼 등 Sapphire 피스는 modules/audio 아래에 있고, 이 feature는 application 계층과 inbound 응답자, lavalink 핸들러를 가져요.)
 */
export { createPlayerWebResponder } from './inbound/playerWeb.ts';
export { actorFromMember, type Actor } from './application/actor.ts';
export type { MusicControl } from './application/control.ts';
export { LavalinkHandler } from './lavalink/handlers/lavalinkHandler.ts';
export { isSameTrack } from './lavalink/handlers/playbackWatchdog.ts';
export { autoPlayRelated, getUserQueuedTracks, queueRelatedUpfront, removeStaleRelatedTracks } from './lavalink/autoPlayRelated.ts';
export { CustomPlayer } from './lavalink/player/customPlayer.ts';
export { nowPlayingTrack } from './lavalink/player/nowPlaying.ts';
export type { NowPlayingCardStore } from './lavalink/player/nowPlayingCard.ts';
export { PlayerNotifier } from './lavalink/player/playerNotifier.ts';
export { NodeSessionStore, RedisStore } from './lavalink/redisStore.ts';
export { isTtsClip, TTS_CLIP_REQUESTER_ID } from './lavalink/requester.ts';
