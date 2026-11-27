import { NextResponse } from "next/server";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { fetchGuildMembers } from "@/lib/data-api/guild-members";
import { db } from "@/lib/db";
import { kstDateString } from "@/lib/kst-date";
import { READ_RATE } from "@/lib/rate-limit";

const daysSchema = z.coerce.number().int().min(1).max(90).safe();

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
  displayName: string | null;
  avatarUrl: string | null;
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

async function enrichRequesters(
  guildId: string,
  requesters: { userId: string; count: number }[],
): Promise<StatsTopRequester[]> {
  if (requesters.length === 0) return [];
  const memberMap = new Map<string, { displayName: string; avatarUrl: string | null }>();
  try {
    const members = await fetchGuildMembers(
      guildId,
      requesters.map((requester) => requester.userId),
    );
    for (const member of members ?? []) {
      memberMap.set(member.id, { displayName: member.displayName, avatarUrl: member.avatarUrl });
    }
  } catch {
  }
  return requesters.map((requester) => {
    const member = memberMap.get(requester.userId);
    return {
      ...requester,
      displayName: member?.displayName ?? null,
      avatarUrl: member?.avatarUrl ?? null,
    };
  });
}

export const GET = createGuildApiHandler({
  role: "manage",
  rate: READ_RATE,
  key: "stats-get",
  handler: async ({ guildId, request }) => {
    const { searchParams } = new URL(request.url);
    const daysParam = searchParams.get("days") ?? "7";

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
      const guild = await db.guild.findUnique({ where: { id: guildId } });
      if (!guild) {
        return NextResponse.json(
          { error: "봇이 설치된 서버가 아니에요." },
          { status: 404 },
        );
      }

      const since =
        days === "safe" ? null : new Date(Date.now() - days * 24 * 3600 * 1000);
      const where = {
        guildId,
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

      const baseRequesters = groupedRequesters.flatMap(
        (row) => (row.userId ? [{ userId: row.userId, count: row._count.userId }] : []),
      );
      const topRequesters = await enrichRequesters(guildId, baseRequesters);

      const dailyMap = new Map<string, number>();
      for (const row of historyRows) {
        const dateKey = kstDateString(row.createdAt);
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
  },
});
