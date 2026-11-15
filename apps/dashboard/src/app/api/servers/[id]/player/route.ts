import { NextResponse } from "next/server";

import { createGuildApiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { READ_RATE } from "@/lib/rate-limit";

interface PlayerTrack {
  id: string;
  title: string;
  artist: string;
  duration: number;
  thumbnail: string | null;
  url: string;
  source: string;
  totalPlays: number;
}

interface RecentEntry extends PlayerTrack {
  playedAt: string;
  requestedById: string | null;
}

export const GET = createGuildApiHandler({
  role: "member",
  rate: READ_RATE,
  key: "player-get",
  handler: async ({ guildId }) => {
    try {
      const [recent, topTracks, totalPlays] = await Promise.all([
        db.guildTrackHistory.findMany({
          where: { guildId },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { track: true },
        }),
        db.guildTrackHistory.groupBy({
          by: ["trackId"],
          where: { guildId },
          _count: { _all: true },
          orderBy: { _count: { trackId: "desc" } },
          take: 10,
        }),
        db.guildTrackHistory.count({ where: { guildId } }),
      ]);

      const topTrackIds = topTracks.map((entry) => entry.trackId);
      const topTrackRows = topTrackIds.length
        ? await db.track.findMany({ where: { id: { in: topTrackIds } } })
        : [];
      const trackById = new Map(topTrackRows.map((track) => [track.id, track]));
      const playCountById = new Map(
        topTracks.map((entry) => [entry.trackId, entry._count._all]),
      );

      // 곡 행을 못 찾은 기록은 건너뛰어요 — 한 행 때문에 패널 전체가 500이 되지 않게.
      // (타입은 필수 관계지만 beta에서 track이 null로 온 기록이 있었어요.)
      const recentTracks: RecentEntry[] = recent.flatMap((entry) => {
        const track = entry.track as typeof entry.track | null;
        if (!track) return [];
        return [
          {
            id: track.id,
            title: track.title,
            artist: track.artist,
            duration: track.duration,
            thumbnail: track.thumbnail,
            url: track.url,
            source: track.source,
            totalPlays: track.totalPlays,
            playedAt: entry.createdAt.toISOString(),
            requestedById: entry.userId,
          },
        ];
      });

      const top: Array<PlayerTrack & { playCount: number }> = topTrackIds
        .map((trackId) => {
          const track = trackById.get(trackId);
          if (!track) return null;
          return {
            id: track.id,
            title: track.title,
            artist: track.artist,
            duration: track.duration,
            thumbnail: track.thumbnail,
            url: track.url,
            source: track.source,
            totalPlays: track.totalPlays,
            playCount: playCountById.get(trackId) ?? 0,
          };
        })
        .filter(
          (entry): entry is PlayerTrack & { playCount: number } => entry !== null,
        );

      return NextResponse.json({
        recent: recentTracks,
        top,
        totalPlays,
      });
    } catch (error) {
      console.error("Failed to load player stats:", error);
      return NextResponse.json(
        { error: "요청을 처리하지 못했어요." },
        { status: 500 },
      );
    }
  },
});
