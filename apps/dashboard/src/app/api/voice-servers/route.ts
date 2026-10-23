import { NextResponse } from "next/server";

import { createGuildApiHandler } from "@/lib/api-handler";
import { READ_RATE } from "@/lib/rate-limit";
import { fetchVoiceServerStats } from "@/lib/voice-server-stats";

// 음성 서버(Lavalink) 노드 주소·리소스를 담는 인프라 노출 API — /api/shards와 같은 관리자 전용 게이트.
export const GET = createGuildApiHandler({
	role: "admin",
	rate: READ_RATE,
	key: "voice-servers",
	handler: async () => {
		try {
			const data = await fetchVoiceServerStats();
			if (!data) return NextResponse.json({ error: "음성 서버 정보를 불러오지 못했어요." }, { status: 500 });
			return NextResponse.json(data);
		} catch (error) {
			console.error("Failed to fetch voice server stats:", error);
			return NextResponse.json({ error: "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 500 });
		}
	},
});
