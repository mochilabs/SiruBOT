import { NextResponse } from "next/server";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { requestPlayerSearch } from "@/lib/data-api/player-web";
import { WRITE_RATE } from "@/lib/rate-limit";

/**
 * 웹에서 곡 검색 — 검색어와 요청자를 봇에 전달해요.
 * 재생 전제 검증(관리자/DJ 권한, 음성 채널 접속, 채널 충돌)도 봇이 수행해
 * 검색 결과 대신 한국어 안내를 내려주면 그대로 사용자에게 보여줘요.
 */
const searchSchema = z.object({
  query: z.string().trim().min(1).max(200),
});

export const POST = createGuildApiHandler({
  role: "member",
  rate: WRITE_RATE,
  key: "player-search",
  schema: searchSchema,
  invalidMessage: "검색어는 1~200자까지 입력할 수 있어요.",
  handler: async ({ guildId, authz, data }) => {
    const result = await requestPlayerSearch(guildId, authz.userId, data.query);
    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "검색을 처리하지 못했어요." }, { status: result.status });
    }

    return NextResponse.json({ tracks: result.tracks ?? [] });
  },
});
