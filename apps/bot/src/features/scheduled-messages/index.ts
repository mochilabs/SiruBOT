/**
 * 예약 메시지 기능의 공개 표면 — 정해진 시각(1회 또는 반복)에 지정 채널로 메시지를 보내요.
 * 핸들러는 ScheduledJob kind `scheduled-message`로 GuildJobScheduler에 등록돼요.
 * Sapphire 피스는 features/scheduled-messages/discord 아래에서 스토어가 직접 읽어요.
 */
export {
	createScheduledMessageService,
	ScheduledMessageService,
	CHANNEL_PROBLEM_MESSAGES,
	type ScheduledMessageDiscordPort,
	type ScheduledMessageEntry,
	type ScheduledMessageServiceDeps
} from './application/scheduledMessageService.ts';
export { createScheduledMessageDiscord, scheduledMessageSendOptions } from './discord/scheduledMessageDiscord.ts';
