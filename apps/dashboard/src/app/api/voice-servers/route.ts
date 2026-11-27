import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { guardRateLimit, publicReadLimit, rateKey } from "@/lib/rate-limit";
import { fetchVoiceServerStats, toPublicVoiceServerSummary } from "@/lib/voice-server-stats";

export async function GET() {
	const session = await auth();
	const limit = publicReadLimit(session?.user?.id);

	const limited = await guardRateLimit(rateKey("voice-servers", limit.subject), limit.rule);
	if (limited) return limited;

	try {
		const data = await fetchVoiceServerStats();
		if (!data) return NextResponse.json({ error: "음성 서버 정보를 불러오지 못했어요." }, { status: 500 });
		return NextResponse.json(toPublicVoiceServerSummary(data));
	} catch (error) {
		console.error("Failed to fetch voice server stats:", error);
		return NextResponse.json({ error: "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 500 });
	}
}
