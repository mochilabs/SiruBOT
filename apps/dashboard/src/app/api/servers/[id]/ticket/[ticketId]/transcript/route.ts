import { NextResponse } from "next/server";

import { createGuildApiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { getDataApiEnv } from "@/lib/env";
import { WRITE_RATE } from "@/lib/rate-limit";

export const GET = createGuildApiHandler({
	role: "manage",
	rate: WRITE_RATE,
	key: "ticket-transcript-get",
	handler: async ({ guildId, params }) => {
		const ticketId = params.ticketId ?? "";
		if (!ticketId) return NextResponse.json({ error: "티켓 ID가 필요해요." }, { status: 400 });

		const ticket = await db.ticket.findFirst({
			where: { id: ticketId, guildId },
			select: { transcriptKey: true, ticketNumber: true, ownerId: true, closeReason: true, closedAt: true }
		});
		if (!ticket) return NextResponse.json({ error: "티켓을 찾을 수 없어요." }, { status: 404 });
		if (!ticket.transcriptKey) {
			return NextResponse.json({ error: "이 티켓에는 저장된 대화 기록이 없어요." }, { status: 404 });
		}

		const { url, authKey } = getDataApiEnv();
		const base = url.replace(/\/+$/, "");
		if (!authKey) return NextResponse.json({ error: "data-api 키가 설정되지 않았어요." }, { status: 503 });

		try {
			const res = await fetch(`${base}/v1/storage/transcripts/${ticket.transcriptKey}`, {
				headers: { Authorization: authKey },
				cache: "no-store",
				signal: AbortSignal.timeout(15_000)
			});
			if (!res.ok) {
				const status = res.status === 404 ? 404 : 502;
				return NextResponse.json({ error: "대화 기록을 불러오지 못했어요." }, { status });
			}
			const json = await new Response(res.body?.pipeThrough(new DecompressionStream("gzip"))).text();
			return new NextResponse(json, {
				headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
			});
		} catch (error) {
			console.error("Failed to load ticket transcript:", error);
			return NextResponse.json({ error: "대화 기록을 불러오지 못했어요." }, { status: 502 });
		}
	}
});
