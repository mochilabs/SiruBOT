import { NextResponse } from "next/server";

import { createGuildApiHandler } from "@/lib/api-handler";
import { fetchDataApi } from "@/lib/data-api/client";
import type { DataApiStatus } from "@/lib/data-api/types";
import { db } from "@/lib/db";
import { READ_RATE } from "@/lib/rate-limit";
import { fetchShards } from "@/lib/shard-api";

export const GET = createGuildApiHandler({
	role: "admin",
	rate: READ_RATE,
	key: "admin-overview-get",
	handler: async () => {
		try {
			const [
				guilds,
				users,
				tracks,
				playlists,
				customCommands,
				openTickets,
				totalTickets,
				activeSocialSubs,
				failedSocialSubs,
				disabledSocialSubs,
				userMemories,
				shards,
				dataApi,
			] = await Promise.all([
				db.guild.count(),
				db.user.count(),
				db.track.count(),
				db.playlist.count(),
				db.customCommand.count(),
				db.ticket.count({ where: { status: "open" } }),
				db.ticket.count(),
				db.socialSubscription.count({ where: { status: "active" } }),
				db.socialSubscription.count({ where: { status: "failed" } }),
				db.socialSubscription.count({ where: { status: "disabled" } }),
				db.userMemory.count(),
				fetchShards().catch(() => null),
				fetchDataApi<DataApiStatus>("/v1/status").catch(() => null),
			]);

			return NextResponse.json({
				counts: {
					guilds,
					users,
					tracks,
					playlists,
					customCommands,
					openTickets,
					totalTickets,
					activeSocialSubs,
					failedSocialSubs,
					disabledSocialSubs,
					userMemories,
				},
				shards,
				dataApi,
			});
		} catch (error) {
			console.error("Failed to load admin overview:", error);
			return NextResponse.json({ error: "운영자 현황 데이터를 불러오지 못했어요." }, { status: 500 });
		}
	},
});
