import { NextResponse } from "next/server";

import { authorizeGuildManage, deniedGuildManage } from "@/lib/api-guards";
import { guardRateLimit, rateKey, READ_RATE } from "@/lib/rate-limit";
import {
  type DiscordChannelSummary,
  SELECTABLE_CHANNEL_TYPES,
} from "@/types/discord";

/** 사용자 토큰으로 Discord에서 채널 목록을 받아요 — 쓰레드 제외, 열려 있는 채널만 옵니다. */
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

  try {
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${id}/channels`,
      {
        headers: { Authorization: `Bearer ${authz.token}` },
        cache: "no-store",
      },
    );

    if (res.status === 401) {
      return NextResponse.json(
        { error: "세션이 만료됐어요. 다시 로그인해 주세요." },
        { status: 401 },
      );
    }
    if (res.status === 403) {
      return NextResponse.json(
        { error: "Discord에서 채널 목록 접근을 거부했어요." },
        { status: 502 },
      );
    }
    if (!res.ok) {
      console.error(`Discord channels fetch failed: ${res.status}`);
      return NextResponse.json(
        { error: "Discord에서 채널 목록을 불러오지 못했어요." },
        { status: 502 },
      );
    }

    const raw: unknown = await res.json();
    if (!Array.isArray(raw)) {
      return NextResponse.json(
        { error: "Discord 응답을 처리하지 못했어요." },
        { status: 502 },
      );
    }

    const allowed = new Set<number>(SELECTABLE_CHANNEL_TYPES);
    const channels: DiscordChannelSummary[] = raw
      .filter(
        (channel): channel is Record<string, unknown> =>
          typeof channel === "object" && channel !== null,
      )
      .filter(
        (channel) =>
          typeof channel.id === "string" &&
          typeof channel.type === "number" &&
          allowed.has(channel.type),
      )
      .map((channel) => ({
        id: channel.id as string,
        name:
          typeof channel.name === "string" ? channel.name : "이름 없는 채널",
        type: channel.type as number,
        parentId:
          typeof channel.parent_id === "string" ? channel.parent_id : null,
        position: typeof channel.position === "number" ? channel.position : 0,
      }))
      .sort((a, b) => a.position - b.position);

    return NextResponse.json({ channels });
  } catch (error) {
    console.error("Failed to load channels:", error);
    return NextResponse.json(
      { error: "요청을 처리하지 못했어요." },
      { status: 500 },
    );
  }
}
