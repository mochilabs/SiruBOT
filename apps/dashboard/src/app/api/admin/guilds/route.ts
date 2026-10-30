import { NextResponse } from "next/server";

import { createGuildApiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { READ_RATE } from "@/lib/rate-limit";

export const GET = createGuildApiHandler({
	role: "admin",
	rate: READ_RATE,
	key: "admin-guilds-get",
	handler: async ({ request }) => {
		try {
			const url = new URL(request.url);
			const q = (url.searchParams.get("q") ?? "").trim();

			const guilds = await db.guild.findMany({
				where: q ? { id: { contains: q } } : undefined,
				orderBy: { updatedAt: "desc" },
				take: 100,
				include: {
					ticketConfig: {
						select: { enabled: true },
					},
					_count: {
						select: {
							customCommands: true,
							assets: true,
							tickets: true,
							history: true,
						},
					},
				},
			});

			const guildIds = guilds.map((g) => g.id);
			const socialCounts =
				guildIds.length > 0
					? await db.socialSubscription.groupBy({
							by: ["guildId"],
							where: { guildId: { in: guildIds } },
							_count: { _all: true },
						})
					: [];
			const socialCountMap = new Map(socialCounts.map((row) => [row.guildId, row._count._all]));

			const items = guilds.map((g) => ({
				id: g.id,
				volume: g.volume,
				ttsVolume: g.ttsVolume,
				ttsDuckLevel: g.ttsDuckLevel,
				repeat: g.repeat,
				related: g.related,
				enableController: g.enableController,
				aiMode: g.aiMode,
				ttsMode: g.ttsMode,
				customCommandPrefix: g.customCommandPrefix,
				jtcEnabled: g.jtcEnabled,
				gaplessEnabled: g.gaplessEnabled,
				crossfadeEnabled: g.crossfadeEnabled,
				crossfadeMs: g.crossfadeMs,
				normalizationEnabled: g.normalizationEnabled,
				countingEnabled: g.countingEnabled,
				ticketEnabled: g.ticketConfig?.enabled ?? false,
				counts: {
					customCommands: g._count.customCommands,
					assets: g._count.assets,
					tickets: g._count.tickets,
					history: g._count.history,
					socialSubscriptions: socialCountMap.get(g.id) ?? 0,
				},
				createdAt: g.createdAt.toISOString(),
				updatedAt: g.updatedAt.toISOString(),
			}));

			return NextResponse.json({ guilds: items });
		} catch (error) {
			console.error("Failed to fetch admin guilds:", error);
			return NextResponse.json({ error: "서버 목록을 불러오지 못했어요." }, { status: 500 });
		}
	},
});
