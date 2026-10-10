import { NextResponse } from "next/server";
import { z } from "zod";

import { authorizeGuildManage, deniedGuildManage } from "@/lib/api-guards";
import { forwardDataApiPost } from "@/lib/data-api";
import { guardRateLimit, rateKey, WRITE_RATE } from "@/lib/rate-limit";
import { zodError } from "@/lib/schemas";

const testSchema = z.object({
	kind: z.enum(["welcome", "goodbye"], "kind는 welcome 또는 goodbye여야 해요."),
});

interface DataApiGreetingSendResult {
	ok: boolean;
	requestId: string;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const authz = await authorizeGuildManage(id);
	if (!authz.ok) return deniedGuildManage(authz);

	const limited = guardRateLimit(rateKey("greeting-test", authz.userId, id), WRITE_RATE);
	if (limited) return limited;

	try {
		const parsed = testSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: zodError(parsed.error) }, { status: 400 });
		}

		// 사용자에게는 로그인한 본인 멤버 정보로 카드를 렌더해 전송해요.
		// requestId는 data-api가 만들어 돌려주고, 테스트 결과 폴링(status)에서 같은 값으로 매칭해요.
		const result = await forwardDataApiPost<DataApiGreetingSendResult>("/v1/internal/greeting/send", {
			guildId: id,
			kind: parsed.data.kind,
			userId: authz.userId,
		});
		if (!result.ok) {
			const status = result.status < 500 ? result.status : 502;
			const fallback =
				result.status < 500 ? "테스트 전송 요청이 거부됐어요." : "봇에 테스트 전송을 전달하지 못했어요. 잠시 후 다시 시도해 주세요.";
			return NextResponse.json({ error: result.message ?? fallback }, { status });
		}

		const requestId = result.data?.requestId;
		if (typeof requestId !== "string" || requestId.length === 0) {
			console.error(`Greeting send response without requestId (guild ${id})`);
			return NextResponse.json({ error: "테스트 전송 결과를 추적하지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 502 });
		}

		return NextResponse.json({ requestId });
	} catch (error) {
		console.error(`Failed to request greeting test (guild ${id}):`, error);
		return NextResponse.json({ error: "요청을 처리하지 못했어요." }, { status: 500 });
	}
}