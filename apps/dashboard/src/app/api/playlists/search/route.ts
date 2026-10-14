import { NextResponse } from "next/server";
import { z } from "zod";

import { authorizeUser, deniedUser } from "@/lib/api-guards";
import { forwardDataApiGet } from "@/lib/data-api";
import { guardRateLimit, rateKey, WRITE_RATE } from "@/lib/rate-limit";
import type { SearchedTrack } from "@/types/playlist";

const searchSchema = z.object({ query: z.string().trim().min(1).max(200) });

export async function GET(request: Request) {
	const authz = await authorizeUser();
	if (!authz.ok) return deniedUser(authz);

	const limited = await guardRateLimit(rateKey("playlist-youtube-search", authz.userId), WRITE_RATE);
	if (limited) return limited;

	const parsed = searchSchema.safeParse({ query: new URL(request.url).searchParams.get("query") });
	if (!parsed.success) return NextResponse.json({ error: "검색어는 1~200자까지 입력해 주세요." }, { status: 400 });

	const result = await forwardDataApiGet<{ tracks: SearchedTrack[] }>(`/v1/youtube/search?query=${encodeURIComponent(parsed.data.query)}`);
	if (!result.ok) {
		return NextResponse.json({ error: result.message ?? "YouTube 검색을 불러오지 못했어요." }, { status: result.status });
	}

	return NextResponse.json({
		tracks: result.data.tracks.map((track) => ({ ...track, youtubeUrl: track.url }))
	});
}
