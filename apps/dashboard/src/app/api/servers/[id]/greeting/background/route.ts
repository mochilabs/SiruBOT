import { NextResponse } from "next/server";
import { z } from "zod";

import { authorizeGuildManage, deniedGuildManage } from "@/lib/api-guards";
import { forwardDataApiPost } from "@/lib/data-api";
import { guardRateLimit, HEAVY_WRITE_RATE, rateKey } from "@/lib/rate-limit";

/** 배경 원본 상한 3MiB — data-api가 저장 규격(JPEG, 긴 변 1600px, 900KB 이하)으로 정규화해요 */
const MAX_BACKGROUND_BYTES = 3 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
/** 인사 이미지 배경은 인사 설정(config) 안에 dataURI로 함께 저장돼요 — 공용 계약의 저장 상한이에요 */
const MAX_SAVED_DATA_URI_LENGTH = 1_500_000;
const SAVED_DATA_URI_PATTERN = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

interface DataApiBackgroundResponse {
	dataUri: string;
}

/** data-api 실패를 대시보드 상태로 정리 — 4xx의 한국어 message는 그대로, 나머지는 502로 내성 있는 fallback */
function forwardFailResponse(status: number, message: string | null, fallback: string): NextResponse {
	const mapped = status < 500 ? status : 502;
	return NextResponse.json({ error: message ?? fallback }, { status: mapped });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const authz = await authorizeGuildManage(id);
	if (!authz.ok) return deniedGuildManage(authz);

	const limited = guardRateLimit(rateKey("greeting-background", authz.userId, id), HEAVY_WRITE_RATE);
	if (limited) return limited;

	const form = await request.formData().catch(() => null);
	if (!form) {
		return NextResponse.json({ error: "요청 형식이 올바르지 않아요." }, { status: 400 });
	}

	const file = form.get("file");
	if (!(file instanceof File) || file.size === 0) {
		return NextResponse.json({ error: "배경 이미지를 선택해 주세요." }, { status: 400 });
	}
	if (file.size > MAX_BACKGROUND_BYTES) {
		return NextResponse.json({ error: "배경 이미지가 너무 커요. 최대 3MB까지 올릴 수 있어요." }, { status: 400 });
	}
	if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
		return NextResponse.json({ error: "PNG, JPEG, WebP 이미지만 지원해요." }, { status: 400 });
	}

	const bytes = Buffer.from(await file.arrayBuffer());
	const uploaded = `data:${file.type};base64,${bytes.toString("base64")}`;

	const result = await forwardDataApiPost<DataApiBackgroundResponse>("/v1/image/member-card/background", {
		dataUri: uploaded,
	});
	if (!result.ok) {
		return forwardFailResponse(result.status, result.message, "배경 이미지를 준비하지 못했어요. 잠시 후 다시 시도해 주세요.");
	}

	// 저장 규격 검증 — data-api 응답이 공용 계약(저장 가능한 dataURI)을 벗어나면 저장 전에 막아요.
	const savedCheck = z
		.string()
		.regex(SAVED_DATA_URI_PATTERN)
		.max(MAX_SAVED_DATA_URI_LENGTH)
		.safeParse(result.data?.dataUri);
	if (!savedCheck.success) {
		console.error(`Greeting background response off-spec (guild ${id}), length: ${result.data?.dataUri.length ?? 0}`);
		return NextResponse.json(
			{ error: "배경 이미지 저장 규격을 벗어났어요. 잠시 후 다시 시도해 주세요." },
			{ status: 502 },
		);
	}

	// 정규화된 배경을 클라이언트로 돌려준다 — 클라이언트는 PATCH /greeting으로 config에 넣어 저장해요.
	return NextResponse.json({ dataUri: savedCheck.data });
}