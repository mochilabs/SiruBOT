/**
 * 음악 기능의 공개 표면. 다른 feature나 core/services는 이 파일을 통해서만 들어와요.
 * (슬래시·버튼 등 Sapphire 피스는 modules/audio 아래에 있고, 이 feature는 application 계층과 inbound 응답자만 가져요.)
 */
export { createPlayerWebResponder } from './inbound/playerWeb.ts';
export { actorFromMember, type Actor } from './application/actor.ts';
export type { MusicControl } from './application/control.ts';
