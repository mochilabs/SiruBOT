import { NextResponse } from "next/server";
import { z } from "zod";

import { dataApiFailResponse, forwardDataApiPost } from "@/lib/data-api/client";
import { guardRateLimit, HEAVY_WRITE_RATE, rateKey } from "@/lib/rate-limit";

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const ALLOWED_BACKGROUND_TYPES = new Set([...ALLOWED_IMAGE_TYPES, "image/gif"]);
const MAX_SAVED_DATA_URI_LENGTH = 1_500_000;
const SAVED_DATA_URI_PATTERN = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const SAVED_BACKGROUND_DATA_URI_PATTERN = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;

export interface GreetingImageUploadOptions {
	rateLimitAction: string;
	dataApiPath: string;
	label: string;
	logName: string;
	allowGif?: boolean;
}

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
	const allowedTypes = options.allowGif ? ALLOWED_BACKGROUND_TYPES : ALLOWED_IMAGE_TYPES;
	if (!allowedTypes.has(file.type)) {
		return NextResponse.json(
			{ error: options.allowGif ? "PNG, JPEG, WebP, GIF 이미지만 지원해요." : "PNG, JPEG, WebP 이미지만 지원해요." },
			{ status: 400 },
		);
	}

	const bytes = Buffer.from(await file.arrayBuffer());
	const uploaded = `data:${file.type};base64,${bytes.toString("base64")}`;

	const result = await forwardDataApiPost<{ dataUri: string }>(options.dataApiPath, {
		dataUri: uploaded,
	});
	if (!result.ok) {
		return dataApiFailResponse(result, `${options.label}를 준비하지 못했어요. 잠시 후 다시 시도해 주세요.`);
	}

	const savedCheck = z
		.string()
		.regex(options.allowGif ? SAVED_BACKGROUND_DATA_URI_PATTERN : SAVED_DATA_URI_PATTERN)
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