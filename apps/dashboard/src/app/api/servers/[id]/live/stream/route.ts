import { NextResponse } from "next/server";

import { createGuildApiHandler } from "@/lib/api-handler";
import { openDataApiStream } from "@/lib/data-api/client";

// 장기 SSE 연결이라 rate limit을 의도적으로 면제해요.
export const GET = createGuildApiHandler({
  role: "member",
  rate: null,
  handler: async ({ guildId }) => {
    const upstream = await openDataApiStream(`/v1/player/${guildId}/stream`);
    if (!upstream) {
      return NextResponse.json(
        { error: "실시간 상태 스트림에 연결하지 못했어요." },
        { status: 502 },
      );
    }

    return new Response(upstream.body, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      },
    });
  },
});
