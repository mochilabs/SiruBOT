import { NextResponse } from "next/server";

import { authorizeDashboardAdmin, deniedUser } from "@/lib/api-guards";
import { guardRateLimit, rateKey, READ_RATE } from "@/lib/rate-limit";
import { fetchVoiceServerStats } from "@/lib/voice-server-stats";

// 음성 서버(Lavalink) 노드 주소·리소스를 담는 인프라 노출 API — /api/shards와 같은 관리자 전용 게이트.
export async function GET() {
	const authz = await authorizeDashboardAdmin();
	if (!authz.ok) return deniedUser(authz);

	const limited = await guardRateLimit(rateKey("voice-servers", authz.userId), READ_RATE);
	if (limited) return limited;

	try {
		const data = await fetchVoiceServerStats();
		if (!data) return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
		return NextResponse.json(data);
	} catch (error) {
		console.error("Failed to fetch voice server stats:", error);
		return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
	}
}
