import { NextResponse } from "next/server";
import type { BotAdminEmojiItem, BotAdminNodeItem, BotAdminReloadStore } from "@sirubot/utils/botAdmin";
import { botAdminKindSchema } from "@sirubot/utils/botAdmin";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { dataApiFailResponse, forwardDataApiPost } from "@/lib/data-api/client";
import { READ_RATE, WRITE_RATE } from "@/lib/rate-limit";

interface BotAdminRelayResponse {
	ok: boolean;
	nodes?: BotAdminNodeItem[];
	emojis?: BotAdminEmojiItem[];
	stores?: BotAdminReloadStore[];
	message?: string;
}

const botControlSchema = z.object({
	kind: botAdminKindSchema,
	nodeId: z.string().trim().min(1).max(32).optional(),
});

export const GET = createGuildApiHandler({
	role: "admin",
	rate: READ_RATE,
	key: "admin-bot-nodes-get",
	handler: async () => {
		const res = await forwardDataApiPost<BotAdminRelayResponse>("/v1/internal/bot-admin", {
			kind: "nodes-status",
		});
		if (!res.ok) {
			return dataApiFailResponse(res, "봇 Lavalink 노드 상태를 불러오지 못했어요.");
		}
		return NextResponse.json({ nodes: res.data.nodes ?? [] });
	},
});

export const POST = createGuildApiHandler({
	role: "admin",
	rate: WRITE_RATE,
	key: "admin-bot-control-post",
	schema: botControlSchema,
	handler: async ({ data }) => {
		const res = await forwardDataApiPost<BotAdminRelayResponse>(
			"/v1/internal/bot-admin",
			{
				kind: data.kind,
				nodeId: data.nodeId,
			},
			{ timeoutMs: 25_000 },
		);
		if (!res.ok) {
			return dataApiFailResponse(res, "봇 제어 요청을 처리하지 못했어요.");
		}
		return NextResponse.json(res.data);
	},
});
