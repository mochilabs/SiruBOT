/**
 * 길드 멤버 표시 정보 — data-api가 봇 캐시에서 조회한 별명·사용자명·아바타를 경유해요.
 */
import { forwardDataApiGet } from "./client";
import type { GuildMemberSummary } from "./types";

/**
 * 멤버 표시 정보를 봇 캐시 경유로 조회해요 (채널·역할과 같은 Redis request/reply).
 * data-api 계약상 한 번에 최대 10명까지만 조회할 수 있어요. 실패하면 null을 돌려
 * 호출자가 사용자 ID 라벨로 폴백하게 해요.
 */
export async function fetchGuildMembers(
  guildId: string,
  userIds: string[],
): Promise<GuildMemberSummary[] | null> {
  const limited = userIds.slice(0, 10);
  if (limited.length === 0) return [];
  const query = limited.map((id) => encodeURIComponent(id)).join(",");
  const result = await forwardDataApiGet<{ members: GuildMemberSummary[] }>(
    `/v1/guilds/${guildId}/members?userIds=${query}`,
  );
  return result.ok ? result.data.members ?? [] : null;
}
