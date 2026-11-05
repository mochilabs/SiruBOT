import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { guardRateLimit, publicReadLimit, rateKey } from "@/lib/rate-limit";
import { fetchVoiceServerStats, toPublicVoiceServerSummary } from "@/lib/voice-server-stats";

// 음성 서버(Lavalink) 스트리밍 개수 공개 API — 로그인 없이 허용해요.
// host(노드 주소)·name·CPU·메모리 등 인프라 텔레메트리는 공격 표면이라 서버에서 제거하고
// 플레이어(스트리밍) 합계만 내려줘요(toPublicVoiceServerSummary). 비로그인은 전역 공용 버킷(SEC-002).
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
