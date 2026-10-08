import { db } from "@/lib/db";
import { getZodiac, type ZodiacInfo } from "@/lib/zodiac";

/* ─────────────────────────── types ─────────────────────────── */

export interface ProfileBirthday {
  month: number | null;
  day: number | null;
  zodiac: ZodiacInfo | null;
}

export interface ProfileRecentTrack {
  title: string;
  artist: string;
  playedAt: string;
}

export interface ProfileTopTrack {
  title: string;
  artist: string;
  count: number;
  thumbnail: string | null;
}

export interface ProfileMusicStats {
  playlistCount: number;
  requestedCount: number;
  listenMs: number;
  listenSampled: boolean;
  recentTracks: ProfileRecentTrack[];
  topTracks: ProfileTopTrack[];
}

export interface ProfileRpsStats {
  wins: number;
  losses: number;
  draws: number;
  bestStreak: number;
}

export interface ProfileGamesStats {
  rps: ProfileRpsStats | null;
  guessBest: number | null;
}

export interface ProfileAttendance {
  checkedInToday: boolean;
  streak: number;
  lastDay: string | null;
}

export interface ProfileStats {
  birthday: ProfileBirthday;
  music: ProfileMusicStats;
  games: ProfileGamesStats;
  attendance: ProfileAttendance;
}

/* ─────────────────────────── zodiac ─────────────────────────── */

/* ─────────────────────────── kst day key ─────────────────────────── */

/** KST 기준 날짜 키 (YYYY-MM-DD) */
function kstDayKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/* ─────────────────────────── stats builder ─────────────────────────── */

const LISTEN_SAMPLE_LIMIT = 500;
const RPS_SAMPLE_LIMIT = 5000;
const GUESS_SAMPLE_LIMIT = 1000;

/**
 * 유저의 음악/게임/출석 통계를 집계해요.
 * API Route와 프로필 페이지(Server Component) 양쪽에서 공유해요.
 */
export async function getProfileStats(userId: string): Promise<ProfileStats> {
  const profile = await db.user.findUnique({
    where: { id: userId },
    select: { birthMonth: true, birthDay: true },
  });

  const month = profile?.birthMonth ?? null;
  const day = profile?.birthDay ?? null;
  const zodiac = month != null && day != null ? getZodiac(month, day) : null;

  const [playlistCount, requestedCount, sample, topGroups, rpsRecords, guessWins, attendanceRecord] = await Promise.all([
    db.playlist.count({ where: { userId } }),
    db.guildTrackHistory.count({ where: { userId } }),
    db.guildTrackHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: LISTEN_SAMPLE_LIMIT,
      select: { createdAt: true, track: { select: { title: true, artist: true, duration: true } } },
    }),
    db.guildTrackHistory.groupBy({
      by: ["trackId"],
      where: { userId },
      _count: { trackId: true },
      orderBy: { _count: { trackId: "desc" } },
      take: 5,
    }),
    db.gameRecord.findMany({
      where: { userId, game: "rps" },
      orderBy: { playedAt: "desc" },
      take: RPS_SAMPLE_LIMIT,
      select: { result: true },
    }),
    db.gameRecord.findMany({
      where: { userId, game: "guess", result: "win" },
      orderBy: { playedAt: "desc" },
      take: GUESS_SAMPLE_LIMIT,
      select: { meta: true },
    }),
    db.gameRecord.findFirst({
      where: { userId, game: "attendance" },
      orderBy: { playedAt: "desc" },
      select: { meta: true },
    }),
  ]);

  const listenMs = sample.reduce((acc, h) => acc + (h.track?.duration ?? 0), 0);
  const recentTracks: ProfileRecentTrack[] = sample.slice(0, 5).map((h) => ({
    title: h.track?.title ?? "알 수 없음",
    artist: h.track?.artist ?? "",
    playedAt: h.createdAt.toISOString(),
  }));

  let topTracks: ProfileTopTrack[] = [];
  if (topGroups.length > 0) {
    const tracks = await db.track.findMany({
      where: { id: { in: topGroups.map((g) => g.trackId) } },
      select: { id: true, title: true, artist: true, thumbnail: true },
    });
    const meta = new Map(tracks.map((t) => [t.id, t]));
    topTracks = topGroups.map((g) => ({
      title: meta.get(g.trackId)?.title ?? "알 수 없음",
      artist: meta.get(g.trackId)?.artist ?? "",
      count: g._count.trackId,
      thumbnail: meta.get(g.trackId)?.thumbnail ?? null,
    }));
  }

  let wins = 0;
  let losses = 0;
  let draws = 0;
  for (const r of rpsRecords) {
    if (r.result === "win") wins += 1;
    else if (r.result === "loss") losses += 1;
    else if (r.result === "draw") draws += 1;
  }
  const hasRps = wins + losses + draws > 0;

  let bestStreak = 0;
  let run = 0;
  for (let i = rpsRecords.length - 1; i >= 0; i -= 1) {
    if (rpsRecords[i]?.result === "win") {
      run += 1;
      if (run > bestStreak) bestStreak = run;
    } else {
      run = 0;
    }
  }

  let guessBest: number | null = null;
  for (const w of guessWins) {
    const attempts = (w.meta as { attempts?: unknown } | null)?.attempts;
    if (typeof attempts === "number" && Number.isInteger(attempts) && attempts > 0) {
      guessBest = guessBest == null ? attempts : Math.min(guessBest, attempts);
    }
  }

  const attendanceMeta = (attendanceRecord?.meta as { streak?: unknown; day?: unknown } | null) ?? {};
  const lastDay = typeof attendanceMeta.day === "string" ? attendanceMeta.day : null;
  const streak = typeof attendanceMeta.streak === "number" ? attendanceMeta.streak : 0;

  return {
    birthday: { month, day, zodiac },
    music: {
      playlistCount,
      requestedCount,
      listenMs,
      listenSampled: requestedCount > sample.length,
      recentTracks,
      topTracks,
    },
    games: {
      rps: hasRps ? { wins, losses, draws, bestStreak } : null,
      guessBest,
    },
    attendance: { checkedInToday: lastDay === kstDayKey(), streak, lastDay },
  };
}
