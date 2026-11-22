/**
 * 생일 축하 기능의 공개 표면 — 서버마다 하루에 한 번, 이 서버에서 축하를 켠 멤버의 생일을 카드 한 장으로 모아 축하해요.
 * 핸들러는 ScheduledJob kind `birthday_daily`로 GuildJobScheduler에 등록돼요. 새 Sapphire 피스는 없어요
 * (축하 켜기·끄기는 features/user-data의 `/프로필 생일축하`가 `container.birthday`를 불러요).
 */
export {
	createBirthdayService,
	BirthdayService,
	type BirthdayDiscordPort,
	type BirthdayMember,
	type BirthdayServiceDeps
} from './application/birthdayService.ts';
export { createBirthdayDiscord } from './discord/birthdayDiscord.ts';
