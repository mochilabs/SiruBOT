/**
 * 대시보드 브리지 기능의 공개 표면 — 대시보드(data-api·notifier)가 Redis로 보내는 요청 중
 * 특정 기능에 속하지 않는 것들(길드 데이터 조회, 봇 관리자 제어, 소셜 웹훅 생성)의 응답자예요.
 * 다른 feature나 core는 이 파일을 통해서만 들어와요.
 */
export { createBotAdminResponder } from './inbound/botAdmin.ts';
export { createGuildDataResponder } from './inbound/guildData.ts';
export { createSocialWebhookResponder } from './inbound/socialWebhook.ts';
