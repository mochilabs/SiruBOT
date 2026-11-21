import { NextResponse } from "next/server";
import { type IncidentNotice, incidentNoticeInputSchema } from "@sirubot/utils/incidentNotice";

import { createGuildApiHandler } from "@/lib/api-handler";
import { dataApiFailResponse, forwardDataApiGet, forwardDataApiPost } from "@/lib/data-api/client";
import { READ_RATE, WRITE_RATE } from "@/lib/rate-limit";

const PATH = "/v1/internal/incident-notice";

/** 현재 장애 공지 조회 — 없으면 `notice: null` */
export const GET = createGuildApiHandler({
	role: "admin",
	rate: READ_RATE,
	key: "admin-incident-notice-get",
	handler: async () => {
		const res = await forwardDataApiGet<{ notice: IncidentNotice | null }>(PATH);
		if (!res.ok) return dataApiFailResponse(res, "장애 공지를 불러오지 못했어요.");
		return NextResponse.json({ notice: res.data.notice });
	},
});

/** 장애 공지 등록 — 본문 200자 이하, 만료(분)는 필수이고 최대 7일이에요. 이전 공지는 덮어써요. */
export const POST = createGuildApiHandler({
	role: "admin",
	rate: WRITE_RATE,
	key: "admin-incident-notice-post",
	schema: incidentNoticeInputSchema,
	handler: async ({ data }) => {
		const res = await forwardDataApiPost<{ ok: true; notice: IncidentNotice }>(PATH, data);
		if (!res.ok) return dataApiFailResponse(res, "장애 공지를 올리지 못했어요.");
		return NextResponse.json({ notice: res.data.notice });
	},
});

/** 장애 공지 내리기 */
export const DELETE = createGuildApiHandler({
	role: "admin",
	rate: WRITE_RATE,
	key: "admin-incident-notice-delete",
	handler: async () => {
		const res = await forwardDataApiPost<{ ok: true }>(PATH, undefined, { method: "DELETE" });
		if (!res.ok) return dataApiFailResponse(res, "장애 공지를 내리지 못했어요.");
		return NextResponse.json({ ok: true });
	},
});
