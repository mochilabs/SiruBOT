/**
 * 봇 ↔ data-api ↔ 대시보드가 공유하는 Redis Pub/Sub 채널명 모음.
 * 채널명은 여러 서비스가 동시에 바꿔야 하므로 한 곳에서 관리해요.
 */

/**
 * 길드 설정 캐시 무효화 브로드캐스트.
 * 대시보드가 설정을 저장하면 data-api가 이 채널로 퍼블리시하고, 모든 봇 프로세스가
 * 구독해 자기 GuildService 캐시에서 해당 길드를 비워요 (다음 조회가 DB에서 다시 읽어요).
 *
 * 페이로드: {"guildId":"<길드 ID>"} — 무효화는 guildId만 전달해 봇이 DB에서 다시 읽게 해요.
 */
export const GUILD_SETTINGS_INVALIDATE_CHANNEL = 'sirubot:guild-settings:invalidate';

/**
 * 봇 프로필(길드 닉네임·아바타) 적용 요청 브로드캐스트.
 * 대시보드 저장 → data-api가 Redis에 pending 페이로드를 적어 두고 이 채널로 guildId를
 * 퍼블리시하면, 해당 길드를 보유한 봇 프로세스가 pending 키를 읽어 discord.js
 * `guild.members.editMe()`로 적용해요. 아바타 데이터 URI가 클 수 있어 큰 본문은
 * 브로드캐스트하지 않고 pending 키로 전달해요 (레플리카마다 복제되지 않아요).
 *
 * 페이로드: {"guildId":"<길드 ID>"} — 본문은 botProfilePendingKey(guildId)에서 읽어요.
 */
export const BOT_PROFILE_SET_CHANNEL = 'sirubot:bot-profile:set';

/** 봇 프로필 상태 퍼블리시 채널 접두사 — 봇이 `sirubot:bot-profile:state:{guildId}`로 현재 상태를 알려요 */
export const BOT_PROFILE_STATE_CHANNEL_PREFIX = 'sirubot:bot-profile:state:';

/**
 * 봇 프로필 적용 대기 키 — data-api가 본문(JSON: {nickname?, avatar?})을 기록해요.
 * TTL은 data-api에서 붙여요; 봇은 읽고 즉시 지워요 (소유 프로세스만 읽어요).
 */
export function botProfilePendingKey(guildId: string): string {
	return `sirubot:bot-profile:pending:${guildId}`;
}

/** 상태 퍼블리시 채널명 — `sirubot:bot-profile:state:{guildId}` */
export function botProfileStateChannel(guildId: string): string {
	return `${BOT_PROFILE_STATE_CHANNEL_PREFIX}${guildId}`;
}
