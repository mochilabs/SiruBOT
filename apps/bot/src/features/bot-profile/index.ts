/**
 * 봇 프로필 기능의 공개 표면 — 길드별 봇 닉네임·아바타 적용과 상태 퍼블리시예요.
 * Sapphire 리스너는 features/bot-profile/discord 아래에서 스토어가 직접 읽어요.
 * 다른 feature나 core는 이 파일을 통해서만 들어와요.
 */
export { BotProfileService, type BotProfileServiceDeps, type BotProfileState } from './application/botProfileService.ts';
export { createBotProfileListeners } from './inbound/botProfile.ts';
