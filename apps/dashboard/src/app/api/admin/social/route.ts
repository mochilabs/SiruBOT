import { NextResponse } from "next/server";

import { createGuildApiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { READ_RATE } from "@/lib/rate-limit";

export const GET = createGuildApiHandler({
	role: "admin",
	rate: READ_RATE,
	key: "admin-social-get",
	handler: async ({ request }) => {
		try {
			const url = new URL(request.url);
			const q = (url.searchParams.get("q") ?? "").trim();
			const status = (url.searchParams.get("status") ?? "").trim();

			const where: Record<string, unknown> = {};
			if (status && ["active", "failed", "disabled"].includes(status)) {
				where.status = status;
			}
			if (q) {
				where.OR = [
					{ guildId: { contains: q } },
					{ sourceName: { contains: q, mode: "insensitive" } },
					{ sourcePlatformId: { contains: q, mode: "insensitive" } },
					{ targetChannelId: { contains: q } },
				];
			}

			const rows = await db.socialSubscription.findMany({
				where,
				orderBy: [{ status: "desc" }, { updatedAt: "desc" }],
				take: 150,
				select: {
					id: true,
					guildId: true,
					platform: true,
					sourcePlatformId: true,
					sourceName: true,
					targetChannelId: true,
					messageTemplate: true,
					webhookName: true,
					webhookAvatarUrl: true,
					showThumbnail: true,
					status: true,
					createdAt: true,
					updatedAt: true,
				},
			});

			const subscriptions = rows.map((row) => ({
				...row,
				createdAt: row.createdAt.toISOString(),
				updatedAt: row.updatedAt.toISOString(),
			}));

			return NextResponse.json({ subscriptions });
		} catch (error) {
			console.error("Failed to fetch admin social subscriptions:", error);
			return NextResponse.json({ error: "소셜 알림 구독 목록을 불러오지 못했어요." }, { status: 500 });
		}
	},
});
