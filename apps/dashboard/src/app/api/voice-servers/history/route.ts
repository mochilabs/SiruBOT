import { NextResponse } from "next/server";
import { z } from "zod";

import { authorizeDashboardAdmin, deniedUser } from "@/lib/api-guards";
import { guardRateLimit, rateKey, READ_RATE } from "@/lib/rate-limit";
import { fetchVoiceServerHistory } from "@/lib/voice-server-stats";

// 음성 서버(Lavalink) 시계열 — /api/voice-servers와 같은 관리자 전용 게이트.
const historyQuerySchema = z.object({
	hours: z.coerce.number().int().min(1).max(168).default(24),
});

export async function GET(request: Request) {
	const authz = await authorizeDashboardAdmin();
	if (!authz.ok) return deniedUser(authz);

	const limited = await guardRateLimit(rateKey("voice-servers-history", authz.userId), READ_RATE);
	if (limited) return limited;

	const { searchParams } = new URL(request.url);
	const parsed = historyQuerySchema.safeParse({ hours: searchParams.get("hours") || "24" });
	if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

	try {
		const data = await fetchVoiceServerHistory(parsed.data.hours);
		if (!data) return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
		return NextResponse.json(data);
	} catch (error) {
		console.error("Failed to fetch voice server history:", error);
		return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
	}
}
