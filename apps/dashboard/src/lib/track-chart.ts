import { Prisma } from "@sirubot/prisma";
import { CHART_GUILD_DAILY_PLAY_CAP, kstDay } from "@sirubot/utils/trackIdentity";

import { escapeLikeWildcard } from "@/app/api/tracks/search-query";
import { db } from "@/lib/db";
import { PAGE_SIZE } from "@/lib/track-constants";

export const CHART_PERIODS = ["today", "week", "month", "all"] as const;
export type ChartPeriod = (typeof CHART_PERIODS)[number];

export interface ChartEntry {
  id: string;
  trackId: string | null;
  title: string;
  artist: string;
  thumbnail: string | null;
  duration: number;
  url: string | null;
  plays: number;
  rank: number;
  rankChange: number | "new" | null;
}

export interface ChartPage {
  period: ChartPeriod;
  entries: ChartEntry[];
  totalCount: number;
  totalPlays: number;
  totalPages: number;
  currentPage: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_DURATION_MS = 60 * 1000;
const MAX_DURATION_MS = 60 * 60 * 1000;

interface Window {
  days?: { from: Date; to: Date };
  since?: { from: Date; to: Date };
}

function windows(period: ChartPeriod, now: Date): { current: Window; previous: Window | null } {
  if (period === "today") {
    return {
      current: { since: { from: new Date(now.getTime() - DAY_MS), to: now } },
      previous: { since: { from: new Date(now.getTime() - 2 * DAY_MS), to: new Date(now.getTime() - DAY_MS) } },
    };
  }
  if (period === "all") return { current: {}, previous: null };
  const length = period === "week" ? 7 : 30;
  const today = kstDay(now);
  const from = new Date(today.getTime() - (length - 1) * DAY_MS);
  return {
    current: { days: { from, to: today } },
    previous: { days: { from: new Date(from.getTime() - length * DAY_MS), to: new Date(from.getTime() - DAY_MS) } },
  };
}

function playsQuery(window: Window): Prisma.Sql {
  const cap = CHART_GUILD_DAILY_PLAY_CAP;
  if (window.since) {
    return Prisma.sql`
      SELECT g."recordingId" AS id, SUM(LEAST(g.c, ${cap}))::int AS plays FROM (
        SELECT t."recordingId", h."guildId", COUNT(*)::int AS c
        FROM "GuildTrackHistory" h JOIN "Track" t ON t."id" = h."trackId"
        WHERE h."createdAt" >= ${window.since.from} AND h."createdAt" < ${window.since.to}
          AND h."userId" IS NOT NULL AND t."recordingId" IS NOT NULL
        GROUP BY 1, 2
      ) g GROUP BY 1`;
  }
  if (window.days) {
    return Prisma.sql`
      SELECT d."recordingId" AS id, SUM(LEAST(d."plays", ${cap}))::int AS plays
      FROM "RecordingDailyPlay" d
      WHERE d."day" >= ${window.days.from}::date AND d."day" <= ${window.days.to}::date
      GROUP BY 1`;
  }
  return Prisma.sql`SELECT r."id" AS id, r."totalPlays" AS plays FROM "Recording" r WHERE r."totalPlays" > 0`;
}

function filters(query: string): Prisma.Sql {
  const base = Prisma.sql`r."duration" > ${MIN_DURATION_MS} AND r."duration" < ${MAX_DURATION_MS}`;
  if (!query) return base;
  const like = `%${escapeLikeWildcard(query)}%`;
  return Prisma.sql`${base} AND (r."title" ILIKE ${like} OR r."artist" ILIKE ${like})`;
}

interface RankedRow {
  id: string;
  plays: number;
  title: string;
  artist: string;
  thumbnail: string | null;
  duration: number;
  total_count: number;
  total_plays: number;
}

export async function fetchChart({ period, query, page }: { period: ChartPeriod; query: string; page: number }): Promise<ChartPage> {
  const { current, previous } = windows(period, new Date());
  const where = filters(query);

  const rows = await db.$queryRaw<RankedRow[]>`
    SELECT r."id", p.plays, r."title", r."artist", r."thumbnail", r."duration",
      COUNT(*) OVER ()::int AS total_count, SUM(p.plays) OVER ()::int AS total_plays
    FROM (${playsQuery(current)}) p JOIN "Recording" r ON r."id" = p.id
    WHERE p.plays > 0 AND ${where}
    ORDER BY p.plays DESC, r."id"
    LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`;

  const ids = rows.map((r) => r.id);
  const [previousRanks, tracks] = await Promise.all([
    previous && !query && ids.length > 0 ? previousRankMap(previous, ids) : Promise.resolve(null),
    ids.length > 0
      ? db.track.findMany({
          where: { recordingId: { in: ids } },
          select: { id: true, recordingId: true, url: true, totalPlays: true },
        })
      : Promise.resolve([]),
  ]);

  const byRecording = new Map<string, typeof tracks>();
  for (const track of tracks) {
    if (!track.recordingId) continue;
    byRecording.set(track.recordingId, [...(byRecording.get(track.recordingId) ?? []), track]);
  }

  const offset = (page - 1) * PAGE_SIZE;
  const entries = rows.map((row, index): ChartEntry => {
    const members = (byRecording.get(row.id) ?? []).sort((a, b) => b.totalPlays - a.totalPlays);
    const lead = members[0];
    const rank = offset + index + 1;
    const before = previousRanks?.get(row.id);
    return {
      id: row.id,
      trackId: lead?.id ?? null,
      title: row.title,
      artist: row.artist,
      thumbnail: row.thumbnail,
      duration: row.duration,
      url: lead?.url ?? null,
      plays: row.plays,
      rank,
      rankChange: previousRanks === null ? null : before === undefined ? "new" : before - rank,
    };
  });

  const totalCount = rows[0]?.total_count ?? 0;
  return {
    period,
    entries,
    totalCount,
    totalPlays: rows[0]?.total_plays ?? 0,
    totalPages: Math.ceil(totalCount / PAGE_SIZE),
    currentPage: page,
  };
}

async function previousRankMap(window: Window, ids: string[]): Promise<Map<string, number>> {
  const rows = await db.$queryRaw<{ id: string; rank: number }[]>`
    SELECT ranked.id, ranked.rank FROM (
      SELECT p.id, ROW_NUMBER() OVER (ORDER BY p.plays DESC, p.id)::int AS rank
      FROM (${playsQuery(window)}) p JOIN "Recording" r ON r."id" = p.id
      WHERE p.plays > 0 AND ${filters("")}
    ) ranked
    WHERE ranked.id IN (${Prisma.join(ids)})`;
  return new Map(rows.map((r) => [r.id, r.rank]));
}
