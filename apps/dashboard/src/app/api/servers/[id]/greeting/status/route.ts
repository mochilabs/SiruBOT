import { NextResponse } from "next/server";

import { createGuildApiHandler } from "@/lib/api-handler";
import { fetchDataApi } from "@/lib/data-api/client";
import { READ_RATE } from "@/lib/rate-limit";

export const GET = createGuildApiHandler({
	role: "manage",
	rate: READ_RATE,
	key: "greeting-status",
	handler: async ({ guildId }) => {
		const state = await fetchDataApi<unknown>(`/v1/greeting/state/${guildId}`);
		if (state === null) {
			return NextResponse.json({ error: "테스트 전송 결과를 불러오지 못했어요." }, { status: 502 });
		}
		return NextResponse.json(state);
	},
});
