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
