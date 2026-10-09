import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManage } from "@/lib/guild-permissions";
import { guardRateLimit, rateKey, READ_RATE } from "@/lib/rate-limit";
import { getSessionAccessToken } from "@/lib/session-token";

/* ─────────────────────────── 입력 검증 ─────────────────────────── */

/**
 * days 파라미터 — "safe"(전체 기간) 또는 1~90 정수.
 * safe는 zod에서 파싱할 수 없어 사전에 분기하고, 나머지는 coerce로 검증해요.
 * 라우트에서 daysParam이 없으면 "7"로 채우므로 default는 없어요.
 */
const daysSchema = z.coerce.number().int().min(1).max(90).safe();

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

/* ─────────────────────────── 응답 타입 ─────────────────────────── */

export interface StatsTopTrack {
  trackId: string;
  title: string;
  artist: string;
  thumbnail: string | null;
  url: string;
  duration: number;
  count: number;
}

export interface StatsTopRequester {
  userId: string;
  count: number;
}

export interface StatsServerStatsResponse {
  ok: true;
  range: { days: number | "safe"; since: string | null };
  totalPlays: number;
  topTracks: StatsTopTrack[];
  topRequesters: StatsTopRequester[];
  dailyCounts: { date: string; count: number }[];
  period: { first: string | null; last: string | null };
}

/* ─────────────────────────── KST 날짜 그룹핑 ─────────────────────────── */

/**
 * createdAt을 Asia/Seoul 기준 YYYY-MM-DD로 변환해요.
 * 일별 재생 막대 차트는 KST 하루 단위로 묶는 게 기대 동작이에요.
 */
function toKstDateString(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/* ─────────────────────────── 서버 통계 (view only) ─────────────────────────── */

/**
 * 길드 재생 기록 통계 — GuildTrackHistory를 Prisma groupBy로 집계해요.
 * 요청자 이름은 Discord API를 추가로 호출하지 않아요 — userId 앞 6자리를
 * 클라이언트에서 축약 라벨로 표시해요.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authz = await authorize(id);
  if (!authz.ok) return denied(authz);

  const limited = guardRateLimit(
    rateKey("stats-get", authz.userId, id),
    READ_RATE,
  );
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const daysParam = searchParams.get("days") ?? "7";

  // "safe"(전체 기간)는 스키마 밖에서 먼저 걸러요 — 나머지는 coerce 검증.
  let days: number | "safe";
  if (daysParam === "safe") {
    days = "safe";
  } else {
    const parsed = daysSchema.safeParse(daysParam);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "days는 1~90 사이의 숫자 또는 'safe'여야 해요." },
        { status: 400 },
      );
    }
    days = parsed.data;
  }

  try {
    const guild = await db.guild.findUnique({ where: { id } });
    if (!guild) {
      return NextResponse.json(
        { error: "봇이 설치된 서버가 아니에요." },
        { status: 404 },
      );
    }

    const since =
      days === "safe" ? null : new Date(Date.now() - days * 24 * 3600 * 1000);
    const where = {
      guildId: id,
      ...(since ? { createdAt: { gte: since } } : {}),
    };

    const [totalPlays, groupedTracks, groupedRequesters, historyRows, periodAggregate] =
      await Promise.all([
        db.guildTrackHistory.count({ where }),
        db.guildTrackHistory.groupBy({
          by: ["trackId"],
          where,
          _count: { trackId: true },
          orderBy: { _count: { trackId: "desc" } },
          take: 10,
        }),
        db.guildTrackHistory.groupBy({
          by: ["userId"],
          where: { ...where, userId: { not: null } },
          _count: { userId: true },
          orderBy: { _count: { userId: "desc" } },
          take: 10,
        }),
        db.guildTrackHistory.findMany({
          where,
          select: { createdAt: true },
          take: days === "safe" ? 45_000 : days * 500,
          orderBy: { createdAt: "desc" },
        }),
        db.guildTrackHistory.aggregate({
          where,
          _min: { createdAt: true },
          _max: { createdAt: true },
        }),
      ]);

    // 트랙 상세 조합 — groupBy 결과 순서를 유지해요.
    const trackIds = groupedTracks.map((row) => row.trackId);
    const tracks =
      trackIds.length > 0
        ? await db.track.findMany({
            where: { id: { in: trackIds } },
            select: {
              id: true,
              title: true,
              artist: true,
              thumbnail: true,
              url: true,
              duration: true,
            },
          })
        : [];
    const trackMap = new Map(tracks.map((track) => [track.id, track]));

    const topTracks: StatsTopTrack[] = groupedTracks.flatMap((row) => {
      const track = trackMap.get(row.trackId);
      if (!track) return [];
      return [
        {
          trackId: row.trackId,
          title: track.title,
          artist: track.artist,
          thumbnail: track.thumbnail,
          url: track.url,
          duration: track.duration,
          count: row._count.trackId,
        },
      ];
    });

    const topRequesters: StatsTopRequester[] = groupedRequesters.flatMap(
      (row) => (row.userId ? [{ userId: row.userId, count: row._count.userId }] : []),
    );

    // 날짜별 재생 수 — KST 하루 단위로 그룹핑 후 오름차순 정렬해요.
    const dailyMap = new Map<string, number>();
    for (const row of historyRows) {
      const dateKey = toKstDateString(row.createdAt);
      dailyMap.set(dateKey, (dailyMap.get(dateKey) ?? 0) + 1);
    }
    const dailyCounts = [...dailyMap.entries()]
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      ok: true as const,
      range: {
        days,
        since: since ? since.toISOString() : null,
      },
      totalPlays,
      topTracks,
      topRequesters,
      dailyCounts,
      period: {
        first: periodAggregate._min.createdAt?.toISOString() ?? null,
        last: periodAggregate._max.createdAt?.toISOString() ?? null,
      },
    } satisfies StatsServerStatsResponse);
  } catch (error) {
    console.error("Failed to fetch server stats:", error);
    return NextResponse.json(
      { error: "통계를 불러오지 못했어요." },
      { status: 500 },
    );
  }
}