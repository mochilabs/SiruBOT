import { forwardDataApiGet } from "./client";
import type { GuildMemberSummary } from "./types";

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
