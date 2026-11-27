import { NextResponse } from "next/server";
import { type IncidentNotice, incidentNoticeInputSchema } from "@sirubot/utils/incidentNotice";

import { createGuildApiHandler } from "@/lib/api-handler";
import { dataApiFailResponse, forwardDataApiGet, forwardDataApiPost } from "@/lib/data-api/client";
import { READ_RATE, WRITE_RATE } from "@/lib/rate-limit";

const PATH = "/v1/internal/incident-notice";

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
