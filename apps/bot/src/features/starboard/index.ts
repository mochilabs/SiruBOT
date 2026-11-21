/**
 * 스타보드 기능의 공개 표면 — 반응이 기준 수 이상 달린 메시지를 스타보드 채널에 모아요.
 * Sapphire 리스너는 features/starboard/discord 아래에서 스토어가 직접 읽어요.
 * 다른 feature나 core는 이 파일을 통해서만 들어와요.
 */
export { createStarboardService, StarboardService, STARBOARD_DEBOUNCE_MS, type StarboardServiceDeps } from './application/starboardService.ts';
export { createStarboardDiscord } from './discord/starboardDiscord.ts';
