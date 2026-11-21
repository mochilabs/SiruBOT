import { NextResponse } from "next/server";
import { kstDay } from "@sirubot/utils/trackIdentity";

import { createGuildApiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { READ_RATE } from "@/lib/rate-limit";
import { type GuildUsageResponse, summarizeGuildModules } from "@/lib/usage-summary";

const DAY_MS = 24 * 60 * 60_000;
/** 최근 7일(오늘 포함 KST 기준) 모듈 사용량을 집계해요 */
const USAGE_DAYS = 7;

export const GET = createGuildApiHandler({
	role: "manage",
	rate: READ_RATE,
	key: "server-usage-get",
	handler: async ({ guildId }) => {
		try {
			const usageFrom = new Date(kstDay(new Date()).getTime() - (USAGE_DAYS - 1) * DAY_MS);
			const grouped = await db.featureDailyUse.groupBy({
				by: ["feature"],
				where: { guildId, day: { gte: usageFrom } },
				_sum: { count: true },
			});
			const rows = grouped.map((g) => ({ feature: g.feature, count: g._sum.count ?? 0 }));
			const { modules, totalUses } = summarizeGuildModules(rows);

			const body: GuildUsageResponse = {
				modules,
				totalUses,
				usageDays: USAGE_DAYS,
			};
			return NextResponse.json(body);
		} catch (error) {
			console.error("Failed to load guild usage:", error);
			return NextResponse.json({ error: "서버 사용량을 불러오지 못했어요." }, { status: 500 });
		}
	},
});
