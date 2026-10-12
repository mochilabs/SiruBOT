import { NextResponse } from "next/server";
import { guildChannelItemSchema } from "@sirubot/utils";
import { z } from "zod";

import { authorizeGuildManage, deniedGuildManage } from "@/lib/api-guards";
import { forwardDataApiGet } from "@/lib/data-api";
import { guardRateLimit, rateKey, READ_RATE } from "@/lib/rate-limit";
import {
  type DiscordChannelSummary,
  SELECTABLE_CHANNEL_TYPES,
} from "@/types/discord";

/** data-api 채널 목록 응답(GET /v1/guilds/:id/channels) — 항목 계약은 @sirubot/utils의 단일 정의를 그대로 써요 */
const channelsResponseSchema = z.object({
  channels: z.array(guildChannelItemSchema),
});

/** data-api가 본문을 못 주면(봇 무응답·Redis 장애·네트워크 실패) 돌려주는 기본 안내 */
const CHANNELS_FALLBACK = "봇에서 채널 목록을 불러오지 못했어요.";

/** data-api(Redis request/reply — 봇이 discord.js 캐시에서 읽어 응답)에서 채널 목록을 받아요. 쓰레드 제외, 선택 가능한 채널만 내려가요. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authz = await authorizeGuildManage(id);
  if (!authz.ok) return deniedGuildManage(authz);

  const limited = await guardRateLimit(
    rateKey("channels-get", authz.userId, id),
    READ_RATE,
  );
  if (limited) return limited;

  const result = await forwardDataApiGet<unknown>(
    `/v1/guilds/${id}/channels`,
  );
  if (!result.ok) {
    // data-api의 한국어 안내는 upstream 상태와 함께 그대로 전달해요 — 본문이 비었으면 502로 감싸요.
    return NextResponse.json(
      { error: result.message ?? CHANNELS_FALLBACK },
      { status: result.message ? result.status : 502 },
    );
  }

  // 응답 본문을 공용 스키마로 검증해요 — 계약이 어긋나면 서버 로그만 남기고 기존 폴백(502)으로 응답해요.
  const parsed = channelsResponseSchema.safeParse(result.data);
  if (!parsed.success) {
    console.error("[channels] data-api 응답이 스키마와 맞지 않아요:", parsed.error);
    return NextResponse.json({ error: CHANNELS_FALLBACK }, { status: 502 });
  }

  const allowed = new Set<number>(SELECTABLE_CHANNEL_TYPES);
  const channels: DiscordChannelSummary[] = parsed.data.channels
    .filter((channel) => allowed.has(channel.type))
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
