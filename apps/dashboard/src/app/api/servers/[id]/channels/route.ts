import { NextResponse } from "next/server";

import { authorizeGuildManage, deniedGuildManage } from "@/lib/api-guards";
import { forwardDataApiGet } from "@/lib/data-api";
import { guardRateLimit, rateKey, READ_RATE } from "@/lib/rate-limit";
import {
  type DiscordChannelSummary,
  SELECTABLE_CHANNEL_TYPES,
} from "@/types/discord";

/** data-api의 채널 한 항목(GET /v1/guilds/:id/channels 계약) — 봇이 Redis에 올려둔 채널 스냅샷이에요 */
interface DataApiGuildChannel {
  id: string;
  name: string;
  type: number;
  parentId: string | null;
  position: number;
}

/** data-api 응답 래퍼 */
interface DataApiGuildChannelsResponse {
  channels: DataApiGuildChannel[];
}

/** data-api가 본문을 못 주면(봇 무응답·Redis 장애·네트워크 실패) 돌려주는 기본 안내 */
const CHANNELS_FALLBACK = "봇에서 채널 목록을 불러오지 못했어요.";

/** data-api(봇 Redis 캐시)에서 채널 목록을 받아요 — 쓰레드 제외, 선택 가능한 채널만 내려가요. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authz = await authorizeGuildManage(id);
  if (!authz.ok) return deniedGuildManage(authz);

  const limited = guardRateLimit(
    rateKey("channels-get", authz.userId, id),
    READ_RATE,
  );
  if (limited) return limited;

  const result = await forwardDataApiGet<DataApiGuildChannelsResponse>(
    `/v1/guilds/${id}/channels`,
  );
  if (!result.ok) {
    // data-api의 한국어 안내는 upstream 상태와 함께 그대로 전달해요 — 본문이 비었으면 502로 감싸요.
    return NextResponse.json(
      { error: result.message ?? CHANNELS_FALLBACK },
      { status: result.message ? result.status : 502 },
    );
  }

  const payload = result.data;
  if (!payload || !Array.isArray(payload.channels)) {
    return NextResponse.json({ error: CHANNELS_FALLBACK }, { status: 502 });
  }

  const allowed = new Set<number>(SELECTABLE_CHANNEL_TYPES);
  const channels: DiscordChannelSummary[] = payload.channels
    .filter(
      (channel): channel is DataApiGuildChannel =>
        typeof channel === "object" &&
        channel !== null &&
        allowed.has(channel.type),
    )
    .map((channel) => ({
      id: channel.id,
      name: channel.name || "이름 없는 채널",
      type: channel.type,
      parentId: channel.parentId,
      position: channel.position,
    }))
    .sort((a, b) => a.position - b.position);

  return NextResponse.json({ channels });
}
