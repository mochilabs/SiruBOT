import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { fetchDataApi } from "@/lib/data-api";
import { canManage } from "@/lib/guild-permissions";
import { guardRateLimit, rateKey, READ_RATE } from "@/lib/rate-limit";
import { getSessionAccessToken } from "@/lib/session-token";

/* ─────────────────────────── data-api 응답 타입 ─────────────────────────── */

export interface LiveQueueTrack {
  title: string;
  author: string;
  durationMs: number;
  artworkUrl: string | null;
  isStream: boolean;
  requesterName: string | null;
}

export interface LivePlayerState {
  guildId: string;
  playing: boolean;
  paused: boolean;
  positionMs: number;
  durationMs: number;
  trackTitle: string | null;
  trackAuthor: string | null;
  artworkUrl: string | null;
  isStream: boolean;
  queue: LiveQueueTrack[];
  queueLength: number;
  repeatMode: "off" | "track" | "queue";
  volume: number;
  requesterName: string | null;
  sourceName: string | null;
  updatedAt: number;
  /** data-api 최종 갱신 기준 밀리초 — 60초 넘으면 stale */
  ageMs: number;
  stale: boolean;
}

interface DataApiLiveResponse {
  player: LivePlayerState | null;
  hub: { guilds: number; subscribed: boolean; staleMs: number };
}

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

/* ─────────────────────────── 라이브 플레이어 상태 (view only) ─────────────────────────── */

/**
 * 라이브 재생 상태 프록시 — data-api `GET /v1/player/:guildId`(AUTH_KEY 인증)를
 * auth+canManage 뒤에서 대신 호출해요. 읽기 전용 — 제어는 bot RPC로 별도 구현 예정이에요.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authz = await authorize(id);
  if (!authz.ok) return denied(authz);

  const limited = guardRateLimit(
    rateKey("live-get", authz.userId, id),
    READ_RATE,
  );
  if (limited) return limited;

  const data = await fetchDataApi<DataApiLiveResponse>(`/v1/player/${id}`);
  if (!data) {
    // data-api 미설정/장애 — SWR 폴백이 "라이브 상태 없음" 화면을 그려요.
    return NextResponse.json(
      { error: "라이브 상태를 불러오지 못했어요." },
      { status: 502 },
    );
  }

  return NextResponse.json(data);
}