import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManage } from "@/lib/guild-permissions";

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

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const session = await auth();

	if (!session?.accessToken) {
		return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
	}
	if (!(await canManage(session.accessToken, id))) {
		return NextResponse.json({ error: "이 서버를 관리할 권한이 없어요." }, { status: 403 });
	}

	try {
		const [recent, topTracks, totalPlays] = await Promise.all([
			db.guildTrackHistory.findMany({
				where: { guildId: id },
				orderBy: { createdAt: "desc" },
				take: 20,
				include: { track: true },
			}),
			db.guildTrackHistory.groupBy({
				by: ["trackId"],
				where: { guildId: id },
				_count: { _all: true },
				orderBy: { _count: { trackId: "desc" } },
				take: 10,
			}),
			db.guildTrackHistory.count({ where: { guildId: id } }),
		]);

		const topTrackIds = topTracks.map((entry) => entry.trackId);
		const topTrackRows = topTrackIds.length
			? await db.track.findMany({ where: { id: { in: topTrackIds } } })
			: [];
		const trackById = new Map(topTrackRows.map((track) => [track.id, track]));
		const playCountById = new Map(topTracks.map((entry) => [entry.trackId, entry._count._all]));

		const recentTracks: RecentEntry[] = recent.map((entry) => ({
			id: entry.track.id,
			title: entry.track.title,
			artist: entry.track.artist,
			duration: entry.track.duration,
			thumbnail: entry.track.thumbnail,
			url: entry.track.url,
			source: entry.track.source,
			totalPlays: entry.track.totalPlays,
			playedAt: entry.createdAt.toISOString(),
			requestedById: entry.userId,
		}));

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
			.filter((entry): entry is PlayerTrack & { playCount: number } => entry !== null);

		return NextResponse.json({
			recent: recentTracks,
			top,
			totalPlays,
		});
	} catch (error) {
		console.error("Failed to load player stats:", error);
		return NextResponse.json({ error: "요청을 처리하지 못했어요." }, { status: 500 });
	}
}