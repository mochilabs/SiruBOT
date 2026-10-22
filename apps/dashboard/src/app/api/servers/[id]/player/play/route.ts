import { NextResponse } from "next/server";
import { playerWebPlayUriSchema } from "@sirubot/utils/playerWeb";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { requestPlayerPlay } from "@/lib/data-api";
import { WRITE_RATE } from "@/lib/rate-limit";

/**
 * 곡 재생 요청 — 검색 결과의 uri(다시 재생 URL 포함)을 봇에 전달해요.
 * 봇은 요청자의 음성 채널로 접속하고 트랙을 큐에 넣어 재생을 보장해요.
 * 검증 실패(음성 미접속·권한 없음·채널 충돌 등) 시 한국어 안내를 그대로 내려줘요.
 * uri는 공용 계약 스키마(http/https 전용)로 검증해요 — 다른 스킴은 내부 fetch(SSRF)로 이어질 수 있어요.
 */
const playSchema = z.object({
  uri: playerWebPlayUriSchema,
});

export const POST = createGuildApiHandler({
  role: "member",
  rate: WRITE_RATE,
  key: "player-play",
  schema: playSchema,
  invalidMessage: "재생할 곡 주소 형식이 올바르지 않아요.",
  handler: async ({ guildId, authz, data }) => {
    const result = await requestPlayerPlay(guildId, authz.userId, data.uri);
    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "재생을 시작하지 못했어요." }, { status: result.status });
    }

    return NextResponse.json({ ok: true });
  },
});
