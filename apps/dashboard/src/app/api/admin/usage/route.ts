import { NextResponse } from "next/server";
import { kstDay } from "@sirubot/utils/trackIdentity";

import { createGuildApiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { READ_RATE } from "@/lib/rate-limit";
import { type AdminUsageResponse,summarizeActivation, summarizeModules, summarizePlayback } from "@/lib/usage-summary";

const DAY_MS = 24 * 60 * 60_000;
/** 신규 서버 활성화율을 보는 기간 */
const ACTIVATION_DAYS = 30;
/** 모듈·재생 집계 기간 (오늘 포함 KST 7일) */
const USAGE_DAYS = 7;

export const GET = createGuildApiHandler({
	role: "admin",
	rate: READ_RATE,
	key: "admin-usage-get",
	handler: async () => {
		try {
			const now = new Date();
			const usageFrom = new Date(kstDay(now).getTime() - (USAGE_DAYS - 1) * DAY_MS);
			const [lifecycles, grouped] = await Promise.all([
				db.guildLifecycle.findMany({
					where: { joinedAt: { gte: new Date(now.getTime() - ACTIVATION_DAYS * DAY_MS) } },
					select: { joinedAt: true, firstUseAt: true, leftAt: true },
				}),
				db.featureDailyUse.groupBy({
					by: ["guildId", "feature"],
					where: { day: { gte: usageFrom } },
					_sum: { count: true },
				}),
			]);
			const rows = grouped.map((g) => ({ guildId: g.guildId, feature: g.feature, count: g._sum.count ?? 0 }));

			const body: AdminUsageResponse = {
				activation: summarizeActivation(lifecycles),
				modules: summarizeModules(rows),
				playback: summarizePlayback(rows),
				activationDays: ACTIVATION_DAYS,
				usageDays: USAGE_DAYS,
			};
			return NextResponse.json(body);
		} catch (error) {
			console.error("Failed to load admin usage:", error);
			return NextResponse.json({ error: "사용 지표를 불러오지 못했어요." }, { status: 500 });
		}
	},
});
