import { NextResponse } from "next/server";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { dataApiFailResponse, forwardDataApiPost } from "@/lib/data-api/client";
import { WRITE_RATE } from "@/lib/rate-limit";

const testSchema = z.object({
	kind: z.enum(["welcome", "goodbye"], "kind는 welcome 또는 goodbye여야 해요."),
});

interface DataApiGreetingSendResult {
	ok: boolean;
	requestId: string;
}

export const POST = createGuildApiHandler({
	role: "manage",
	rate: WRITE_RATE,
	key: "greeting-test",
	schema: testSchema,
	handler: async ({ guildId, authz, data }) => {
		try {
			const result = await forwardDataApiPost<DataApiGreetingSendResult>("/v1/internal/greeting/send", {
				guildId,
				kind: data.kind,
				userId: authz.userId,
			});
			if (!result.ok) {
				return dataApiFailResponse(
					result,
					result.status < 500
						? "테스트 전송 요청이 거부됐어요."
						: "봇에 테스트 전송을 전달하지 못했어요. 잠시 후 다시 시도해 주세요.",
				);
			}

			const requestId = result.data?.requestId;
			if (typeof requestId !== "string" || requestId.length === 0) {
				console.error(`Greeting send response without requestId (guild ${guildId})`);
				return NextResponse.json({ error: "테스트 전송 결과를 추적하지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 502 });
			}

			return NextResponse.json({ requestId });
		} catch (error) {
			console.error(`Failed to request greeting test (guild ${guildId}):`, error);
			return NextResponse.json({ error: "요청을 처리하지 못했어요." }, { status: 500 });
		}
	},
});
