import { Prisma, type PrismaClient } from '@sirubot/prisma';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_EVENTS = 100_000;
const TRACK_ID_CHUNK = 1000;

export interface WrappedEvent {
	trackId: string;
	createdAt: Date;
}

export interface WrappedTrackInfo {
	id: string;
	title: string;
	artist: string;
	duration: number;
	thumbnail: string | null;
	recordingId: string | null;
}

export interface WrappedRanking {
	pool: number;
	rank: number;
	topPercent: number;
}

export interface WrappedStats {
	totalPlays: number;
	totalMinutes: number;
	uniqueTracks: number;
	activeDays: number;
	longestStreak: number;
	peakHour: number | null;
	hourCounts: number[];
	topTracks: Array<{ title: string; artist: string; thumbnail: string | null; plays: number }>;
	topArtists: Array<{ artist: string; plays: number }>;
	ranking: WrappedRanking | null;
	topArtistRanking: (WrappedRanking & { artist: string }) | null;
}

export const MIN_RANKING_POOL = 5;

export function rankingOf(pool: number, higher: number): WrappedRanking | null {
	if (pool < MIN_RANKING_POOL) return null;
	const rank = higher + 1;
	return { pool, rank, topPercent: Math.min(100, Math.max(1, Math.ceil((rank / pool) * 100))) };
}

function kstDayIndex(date: Date): number {
	return Math.floor((date.getTime() + KST_OFFSET_MS) / DAY_MS);
}

function kstHour(date: Date): number {
	return new Date(date.getTime() + KST_OFFSET_MS).getUTCHours();
}

function longestStreakOf(days: Set<number>): number {
	let best = 0;
	for (const day of days) {
		if (days.has(day - 1)) continue;
		let length = 1;
		while (days.has(day + length)) length += 1;
		if (length > best) best = length;
	}
	return best;
}

export function summarizeWrapped(
	events: readonly WrappedEvent[],
	tracks: ReadonlyMap<string, WrappedTrackInfo>,
	limits = { tracks: 5, artists: 5 }
): WrappedStats {
	const hourCounts = new Array<number>(24).fill(0);
	const days = new Set<number>();
	const playsByTrack = new Map<string, number>();
	for (const event of events) {
		hourCounts[kstHour(event.createdAt)]! += 1;
		days.add(kstDayIndex(event.createdAt));
		playsByTrack.set(event.trackId, (playsByTrack.get(event.trackId) ?? 0) + 1);
	}

	let totalMs = 0;
	const byKey = new Map<string, { title: string; artist: string; thumbnail: string | null; plays: number }>();
	const byArtist = new Map<string, number>();
	for (const [trackId, plays] of playsByTrack) {
		const track = tracks.get(trackId);
		if (!track) continue;
		totalMs += track.duration * plays;
		const key = track.recordingId ?? track.id;
		const entry = byKey.get(key);
		if (entry) {
			entry.plays += plays;
			entry.thumbnail ??= track.thumbnail;
		} else {
			byKey.set(key, { title: track.title, artist: track.artist, thumbnail: track.thumbnail, plays });
		}
		const artist = track.artist.trim();
		if (artist) byArtist.set(artist, (byArtist.get(artist) ?? 0) + plays);
	}

	const peak = Math.max(...hourCounts);
	return {
		totalPlays: events.length,
		totalMinutes: Math.round(totalMs / 60_000),
		uniqueTracks: byKey.size,
		activeDays: days.size,
		longestStreak: longestStreakOf(days),
		peakHour: peak > 0 ? hourCounts.indexOf(peak) : null,
		hourCounts,
		topTracks: [...byKey.values()].sort((a, b) => b.plays - a.plays).slice(0, limits.tracks),
		topArtists: [...byArtist.entries()]
			.map(([artist, plays]) => ({ artist, plays }))
			.sort((a, b) => b.plays - a.plays)
			.slice(0, limits.artists),
		ranking: null,
		topArtistRanking: null
	};
}

export interface WrappedQuery {
	userId: string;
	guildId: string | null;
	from: Date;
	to: Date;
}

export async function loadWrappedStats(db: PrismaClient, query: WrappedQuery): Promise<WrappedStats> {
	const events = await db.guildTrackHistory.findMany({
		where: { userId: query.userId, ...(query.guildId ? { guildId: query.guildId } : {}), createdAt: { gte: query.from, lt: query.to } },
		select: { trackId: true, createdAt: true },
		orderBy: { createdAt: 'desc' },
		take: MAX_EVENTS
	});

	const ids = [...new Set(events.map((e) => e.trackId))];
	const tracks = new Map<string, WrappedTrackInfo>();
	for (let i = 0; i < ids.length; i += TRACK_ID_CHUNK) {
		const rows = await db.track.findMany({
			where: { id: { in: ids.slice(i, i + TRACK_ID_CHUNK) } },
			select: { id: true, title: true, artist: true, duration: true, thumbnail: true, recordingId: true }
		});
		for (const row of rows) tracks.set(row.id, row);
	}
	const stats = summarizeWrapped(events, tracks);
	if (stats.totalPlays === 0) return stats;

	stats.ranking = await loadRanking(db, query, null);
	const topArtist = stats.topArtists[0];
	if (topArtist) {
		const ranking = await loadRanking(db, query, topArtist.artist);
		stats.topArtistRanking = ranking ? { ...ranking, artist: topArtist.artist } : null;
	}
	return stats;
}

async function loadRanking(db: PrismaClient, query: WrappedQuery, artist: string | null): Promise<WrappedRanking | null> {
	const guildFilter = query.guildId ? Prisma.sql`AND h."guildId" = ${query.guildId}` : Prisma.empty;
	const artistJoin = artist ? Prisma.sql`JOIN "Track" t ON t.id = h."trackId"` : Prisma.empty;
	const artistFilter = artist ? Prisma.sql`AND btrim(t.artist) = ${artist}` : Prisma.empty;
	const [row] = await db.$queryRaw<{ pool: bigint; higher: bigint; mine: bigint | null }[]>(Prisma.sql`
		WITH per_user AS (
			SELECT h."userId", COUNT(*) AS plays
			FROM "GuildTrackHistory" h ${artistJoin}
			WHERE h."userId" IS NOT NULL AND h."createdAt" >= ${query.from} AND h."createdAt" < ${query.to} ${guildFilter} ${artistFilter}
			GROUP BY h."userId"
		), me AS (SELECT plays FROM per_user WHERE "userId" = ${query.userId})
		SELECT COUNT(*) AS pool,
			COUNT(*) FILTER (WHERE plays > COALESCE((SELECT plays FROM me), 0)) AS higher,
			(SELECT plays FROM me) AS mine
		FROM per_user`);
	if (!row || row.mine === null) return null;
	return rankingOf(Number(row.pool), Number(row.higher));
}

export type WrappedPeriod = 'month' | 'year' | 'all';

export function resolveWrappedRange(period: WrappedPeriod, now = new Date()): { from: Date; to: Date; label: string } {
	if (period === 'month') return { from: new Date(now.getTime() - 30 * DAY_MS), to: now, label: '최근 30일' };
	if (period === 'year') {
		const kstYear = new Date(now.getTime() + KST_OFFSET_MS).getUTCFullYear();
		return { from: new Date(Date.UTC(kstYear, 0, 1) - KST_OFFSET_MS), to: now, label: `${kstYear}년` };
	}
	return { from: new Date(0), to: now, label: '전체 기간' };
}
