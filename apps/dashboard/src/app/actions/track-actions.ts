"use server";

import { db } from "@/lib/db";

const PAGE_SIZE = 20;

const fixedTrackFilter = {
	duration: {
		gt: 60 * 1000,
		lt: 60 * 1000 * 60
	},
	totalPlays: {
		gt: 10
	}
} as const;

export async function getTracksAction(page: number, query?: string) {
	const skip = (page - 1) * PAGE_SIZE;

	const where = query ? {
		...fixedTrackFilter,
		OR: [
			{ title: { contains: query, mode: "insensitive" as const } },
			{ artist: { contains: query, mode: "insensitive" as const } }
		]
	} : fixedTrackFilter;

	const tracks = await db.track.findMany({
		orderBy: [{ totalPlays: "desc" }, { updatedAt: "desc" }],
		where,
		take: PAGE_SIZE,
		skip,
	});

	return tracks;
}
