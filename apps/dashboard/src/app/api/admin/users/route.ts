import { NextResponse } from "next/server";

import { createGuildApiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { READ_RATE } from "@/lib/rate-limit";

export const GET = createGuildApiHandler({
	role: "admin",
	rate: READ_RATE,
	key: "admin-users-get",
	handler: async ({ request }) => {
		try {
			const url = new URL(request.url);
			const q = (url.searchParams.get("q") ?? "").trim();

			const users = await db.user.findMany({
				where: q
					? {
							OR: [{ id: { contains: q } }, { intro: { contains: q, mode: "insensitive" } }],
						}
					: undefined,
				orderBy: { updatedAt: "desc" },
				take: 100,
				include: {
					_count: {
						select: {
							playlists: true,
							gameRecords: true,
							history: true,
						},
					},
				},
			});

			const userIds = users.map((u) => u.id);
			const memories =
				userIds.length > 0
					? await db.userMemory.findMany({
							where: { userId: { in: userIds } },
							select: { userId: true, longTerm: true, shortTerm: true, updatedAt: true },
						})
					: [];
			const memoryMap = new Map(memories.map((m) => [m.userId, m]));

			const items = users.map((u) => {
				const mem = memoryMap.get(u.id);
				const hasLongTerm = typeof mem?.longTerm === "string" && mem.longTerm.trim().length > 0;
				const shortTermCount = Array.isArray(mem?.shortTerm) ? mem.shortTerm.length : 0;

				return {
					id: u.id,
					birthMonth: u.birthMonth,
					birthDay: u.birthDay,
					intro: u.intro,
					hasLongTermMemory: hasLongTerm,
					shortTermTurns: shortTermCount,
					counts: {
						playlists: u._count.playlists,
						gameRecords: u._count.gameRecords,
						history: u._count.history,
					},
					createdAt: u.createdAt.toISOString(),
					updatedAt: u.updatedAt.toISOString(),
				};
			});

			return NextResponse.json({ users: items });
		} catch (error) {
			console.error("Failed to fetch admin users:", error);
			return NextResponse.json({ error: "유저 목록을 불러오지 못했어요." }, { status: 500 });
		}
	},
});
