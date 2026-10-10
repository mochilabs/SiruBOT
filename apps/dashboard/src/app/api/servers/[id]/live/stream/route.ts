import { NextResponse } from "next/server";

import { authorizeGuildManage, deniedGuildManage } from "@/lib/api-guards";
import { openDataApiStream } from "@/lib/data-api";

/**
 * 실시간 상태 스트림 프록시 — data-api `GET /v1/player/:guildId/stream`(SSE)을
 * auth+canManage 뒤에서 그대로 relay해요. 인가가 끝난 뒤엔 파이프라인만 유지하면
 * 서버 리소스를 거의 쓰지 않아요 — rate limit은 적용하지 않아요 (장기 연결).
 * 미설정/장애 모두 502로 통일 — 클라이언트가 폴링으로 폴백해요.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authz = await authorizeGuildManage(id);
  if (!authz.ok) return deniedGuildManage(authz);

  const upstream = await openDataApiStream(`/v1/player/${id}/stream`);
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
}