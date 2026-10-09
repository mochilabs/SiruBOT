import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { openDataApiStream } from "@/lib/data-api";
import { canManage } from "@/lib/guild-permissions";
import { getSessionAccessToken } from "@/lib/session-token";

/* ─────────────────────────── 인증 ─────────────────────────── */

async function authorize(
  guildId: string,
): Promise<{ ok: true; userId: string } | { ok: false; status: 401 | 403 }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, status: 401 };
  const accessToken = await getSessionAccessToken();
  if (!accessToken) return { ok: false, status: 401 };
  if (!(await canManage(accessToken, guildId)))
    return { ok: false, status: 403 };
  return { ok: true, userId: session.user.id };
}

function denied(authz: { ok: false; status: 401 | 403 }) {
  return NextResponse.json(
    {
      error:
        authz.status === 401
          ? "로그인이 필요해요."
          : "이 서버를 관리할 권한이 없어요.",
    },
    { status: authz.status },
  );
}

/* ─────────────────────────── 라이브 플레이어 상태 SSE ─────────────────────────── */

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
  const authz = await authorize(id);
  if (!authz.ok) return denied(authz);

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