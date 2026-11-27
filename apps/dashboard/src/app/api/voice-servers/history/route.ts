import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { guardRateLimit, publicReadLimit, rateKey } from "@/lib/rate-limit";
import { fetchVoiceServerHistory, toPublicVoiceServerHistory } from "@/lib/voice-server-stats";

const historyQuerySchema = z.object({
	hours: z.coerce.number().int().min(1).max(168).default(24),
});

export async function GET(request: Request) {
	const session = await auth();
	const limit = publicReadLimit(session?.user?.id);

	const limited = await guardRateLimit(rateKey("voice-servers-history", limit.subject), limit.rule);
	if (limited) return limited;

	const { searchParams } = new URL(request.url);
	const parsed = historyQuerySchema.safeParse({ hours: searchParams.get("hours") || "24" });
	if (!parsed.success) return NextResponse.json({ error: "요청 형식이 올바르지 않아요." }, { status: 400 });

	try {
		const data = await fetchVoiceServerHistory(parsed.data.hours);
		if (!data) return NextResponse.json({ error: "음성 서버 이력을 불러오지 못했어요." }, { status: 500 });
		return NextResponse.json(toPublicVoiceServerHistory(data));
	} catch (error) {
		console.error("Failed to fetch voice server history:", error);
		return NextResponse.json({ error: "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 500 });
	}
}
