import { NextResponse } from "next/server";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { forwardDataApiGet } from "@/lib/data-api";
import { WRITE_RATE } from "@/lib/rate-limit";
import type { SearchedTrack } from "@/types/playlist";

const searchSchema = z.object({ query: z.string().trim().min(1).max(200) });

export const GET = createGuildApiHandler({
	role: "user",
	rate: WRITE_RATE,
	key: "playlist-youtube-search",
	handler: async ({ request }) => {
		const parsed = searchSchema.safeParse({ query: new URL(request.url).searchParams.get("query") });
		if (!parsed.success) return NextResponse.json({ error: "검색어는 1~200자까지 입력해 주세요." }, { status: 400 });

		const result = await forwardDataApiGet<{ tracks: SearchedTrack[] }>(`/v1/youtube/search?query=${encodeURIComponent(parsed.data.query)}`);
		if (!result.ok) {
			return NextResponse.json({ error: result.message ?? "검색 결과를 불러오지 못했어요." }, { status: result.status });
		}

		return NextResponse.json({
			tracks: result.data.tracks.map((track) => ({ ...track, youtubeUrl: track.url }))
		});
	},
});
