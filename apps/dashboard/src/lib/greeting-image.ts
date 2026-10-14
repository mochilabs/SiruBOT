import { NextResponse } from "next/server";
import { z } from "zod";

import { dataApiFailResponse, forwardDataApiPost } from "@/lib/data-api";
import { guardRateLimit, HEAVY_WRITE_RATE, rateKey } from "@/lib/rate-limit";

/** 이미지 업로드 원본 상한 3MiB — data-api가 저장 규격으로 정규화해요 */
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
/** 인사 이미지(배경·레이어)는 인사 설정(config) 안에 dataURI로 함께 저장돼요 — 공용 계약의 저장 상한이에요 */
const MAX_SAVED_DATA_URI_LENGTH = 1_500_000;
const SAVED_DATA_URI_PATTERN = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

export interface GreetingImageUploadOptions {
	/** rate-limit 키 조각 — 예: "greeting-background" */
	rateLimitAction: string;
	/** data-api 정규화 엔드포인트 경로 */
	dataApiPath: string;
	/** 사용자 안내 문구의 이미지 이름 — 예: "배경 이미지" */
	label: string;
	/** 저장 규격 위반 콘솔 로그의 이미지 이름 — 예: "background" */
	logName: string;
}

/**
 * 인사 카드 이미지 업로드 정규화 공통 흐름 — 배경(JPEG 정규화)과 레이어(PNG 정규화)
 * 라우트가 공유해요. 업로드 검증 → dataURI 변환 → data-api 정규화 → 저장 규격 검증
 * → 정규화된 dataURI를 클라이언트로 돌려줘요 (클라이언트는 PATCH /greeting으로 config에 넣어 저장해요).
 */
export async function handleGreetingImageUpload(
	request: Request,
	authz: { userId: string },
	guildId: string,
	options: GreetingImageUploadOptions,
): Promise<NextResponse> {
	const limited = await guardRateLimit(
		rateKey(options.rateLimitAction, authz.userId, guildId),
		HEAVY_WRITE_RATE,
	);
	if (limited) return limited;

	const form = await request.formData().catch(() => null);
	if (!form) {
		return NextResponse.json({ error: "요청 형식이 올바르지 않아요." }, { status: 400 });
	}

	const file = form.get("file");
	if (!(file instanceof File) || file.size === 0) {
		return NextResponse.json({ error: `${options.label}를 선택해 주세요.` }, { status: 400 });
	}
	if (file.size > MAX_IMAGE_BYTES) {
		return NextResponse.json(
			{ error: `${options.label}가 너무 커요. 최대 3MB까지 올릴 수 있어요.` },
			{ status: 400 },
		);
	}
	if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
		return NextResponse.json({ error: "PNG, JPEG, WebP 이미지만 지원해요." }, { status: 400 });
	}

	const bytes = Buffer.from(await file.arrayBuffer());
	const uploaded = `data:${file.type};base64,${bytes.toString("base64")}`;

	const result = await forwardDataApiPost<{ dataUri: string }>(options.dataApiPath, {
		dataUri: uploaded,
	});
	if (!result.ok) {
		return dataApiFailResponse(result, `${options.label}를 준비하지 못했어요. 잠시 후 다시 시도해 주세요.`);
	}

	// 저장 규격 검증 — data-api 응답이 공용 계약(저장 가능한 dataURI)을 벗어나면 저장 전에 막아요.
	const savedCheck = z
		.string()
		.regex(SAVED_DATA_URI_PATTERN)
		.max(MAX_SAVED_DATA_URI_LENGTH)
		.safeParse(result.data?.dataUri);
	if (!savedCheck.success) {
		console.error(
			`Greeting ${options.logName} response off-spec (guild ${guildId}), length: ${result.data?.dataUri.length ?? 0}`,
		);
		return NextResponse.json(
			{ error: `${options.label} 저장 규격을 벗어났어요. 잠시 후 다시 시도해 주세요.` },
			{ status: 502 },
		);
	}

	return NextResponse.json({ dataUri: savedCheck.data });
}