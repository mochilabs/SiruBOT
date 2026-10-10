import { NextResponse } from "next/server";

import { authorizeGuildManage, deniedGuildManage } from "@/lib/api-guards";
import { fetchDataApi } from "@/lib/data-api";
import { guardRateLimit, rateKey, READ_RATE } from "@/lib/rate-limit";

/**
 * 인사 테스트 전송 결과 폴링 — data-api /v1/greeting/state/:guildId를 그대로 전달해요.
 * 응답은 { found: false } 또는 { found: true, requestId, kind, ok, error, sentAt }이고,
 * 클라이언트는 send 응답의 requestId와 매칭해요 (봇의 실패 사유 error 문자열도 그대로 전달해요).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const authz = await authorizeGuildManage(id);
	if (!authz.ok) return deniedGuildManage(authz);

	const limited = guardRateLimit(rateKey("greeting-status", authz.userId, id), READ_RATE);
	if (limited) return limited;

	const state = await fetchDataApi<unknown>(`/v1/greeting/state/${id}`);
	if (state === null) {
		// data-api 미설정/장애 — 봇 결과 허브 상태를 알 수 없어요.
		return NextResponse.json({ error: "테스트 전송 결과를 불러오지 못했어요." }, { status: 502 });
	}
	return NextResponse.json(state);
}