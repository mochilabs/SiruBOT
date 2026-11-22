/**
 * 나눔 기능의 공개 표면 — 참여 카드와 버튼, 마감 추첨, 다시 뽑기.
 * 마감은 ScheduledJob kind `giveaway_end`로 GuildJobScheduler에 등록돼요.
 * Sapphire 피스는 features/giveaway/discord 아래에서 스토어가 직접 읽어요.
 */
export {
	createGiveawayService,
	GiveawayService,
	type GiveawayCardData,
	type GiveawayDiscordPort,
	type GiveawayServiceDeps
} from './application/giveawayService.ts';
export { createGiveawayDiscord } from './discord/giveawayDiscord.ts';
export { createGiveawayManageResponder } from './inbound/giveawayManage.ts';
