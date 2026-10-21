import { NextResponse } from "next/server";
import { ASSET_ALLOWED_MIME_TYPES, ASSET_BUCKET, ASSET_MAX_BYTES, ASSET_NAME_MAX_LENGTH, assetKeyFor, sniffImageMime } from "@sirubot/utils";

import { createGuildApiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { READ_RATE, UPLOAD_RATE } from "@/lib/rate-limit";
import { deleteAssetObject, putAssetObject, type PutAssetResult } from "@/lib/storage";

/** 에셋 응답 공통 요약 — 목록·업로드·이름 변경이 같은 모양을 돌려줘요 */
interface AssetSummary {
	id: string;
	name: string;
	url: string;
	mimeType: string;
	sizeBytes: number;
	createdAt: string;
}

function toSummary(asset: {
	id: string;
	name: string;
	url: string;
	mimeType: string;
	sizeBytes: number;
	createdAt: Date;
}): AssetSummary {
	return {
		id: asset.id,
		name: asset.name,
		url: asset.url,
		mimeType: asset.mimeType,
		sizeBytes: asset.sizeBytes,
		createdAt: asset.createdAt.toISOString()
	};
}

/** GET /api/servers/[id]/assets — 길드 이미지 에셋 목록 (최근 등록순) */
export const GET = createGuildApiHandler({
	role: "manage",
	rate: READ_RATE,
	key: "asset-list",
	handler: async ({ guildId }) => {
		try {
			const assets = await db.guildAsset.findMany({
				where: { guildId },
				orderBy: { createdAt: "desc" },
				select: { id: true, name: true, url: true, mimeType: true, sizeBytes: true, createdAt: true }
			});
			return NextResponse.json({ assets: assets.map(toSummary) });
		} catch (error) {
			console.error("Failed to list guild assets:", error);
			return NextResponse.json({ error: "요청을 처리하지 못했어요." }, { status: 500 });
		}
	},
});

/**
 * POST /api/servers/[id]/assets — multipart `file` 업로드.
 * file.type은 클라이언트가 보내는 값이라 신뢰하지 않고 매직 바이트로 실제 형식을 다시 판별해요.
 * 본문이 formData라 래퍼의 JSON schema 검증이 아니라 핸들러가 직접 검증해요.
 */
export const POST = createGuildApiHandler({
	role: "manage",
	rate: UPLOAD_RATE,
	key: "asset-upload",
	handler: async ({ guildId, authz, request }) => {
		const form = await request.formData().catch(() => null);
		if (!form) {
			return NextResponse.json({ error: "요청 형식이 올바르지 않아요." }, { status: 400 });
		}

		const file = form.get("file");
		if (!(file instanceof File) || file.size === 0) {
			return NextResponse.json({ error: "이미지를 선택해 주세요." }, { status: 400 });
		}
		if (file.size > ASSET_MAX_BYTES) {
			return NextResponse.json({ error: `이미지가 너무 커요. 최대 ${Math.floor(ASSET_MAX_BYTES / 1024 / 1024)}MB까지 올릴 수 있어요.` }, { status: 400 });
		}
		if (!ASSET_ALLOWED_MIME_TYPES.has(file.type)) {
			return NextResponse.json({ error: "PNG, JPEG, WebP, GIF 이미지만 지원해요." }, { status: 400 });
		}

		const bytes = new Uint8Array(await file.arrayBuffer());
		// 재검증 — 매직 바이트로 판별된 형식만 신뢰해요 (스토리지도 같은 방식으로 검증해요)
		const mime = sniffImageMime(bytes);
		if (!mime || !ASSET_ALLOWED_MIME_TYPES.has(mime)) {
			return NextResponse.json({ error: "PNG, JPEG, WebP, GIF 이미지만 지원해요." }, { status: 400 });
		}

		let key: string;
		try {
			key = assetKeyFor(guildId, crypto.randomUUID(), mime);
		} catch {
			return NextResponse.json({ error: "요청이 올바르지 않아요." }, { status: 400 });
		}

		let uploaded: PutAssetResult;
		try {
			uploaded = await putAssetObject(key, bytes);
		} catch (error) {
			console.error(`Failed to upload guild asset (guild ${guildId}):`, error);
			return NextResponse.json(
				{ error: error instanceof Error ? error.message : "이미지를 저장하지 못했어요. 잠시 후 다시 시도해 주세요." },
				{ status: 502 },
			);
		}

		// 이름 — 원본 파일명에서 경로를 떼고 길이만 줄여요 (비면 '이미지')
		const rawName = file.name.split(/[\\/]/).pop()?.trim() ?? "";
		const name = (rawName || "이미지").slice(0, ASSET_NAME_MAX_LENGTH);

		try {
			// GuildAsset는 Guild FK를 가져요 — 길드 행이 아직 없으면 먼저 만들어 둬요 (커스텀 명령어 선례)
			await db.guild.upsert({ where: { id: guildId }, create: { id: guildId }, update: {} });
			const asset = await db.guildAsset.create({
				data: {
					guildId,
					bucket: ASSET_BUCKET,
					key,
					name,
					mimeType: mime,
					sizeBytes: bytes.length,
					url: uploaded.url,
					createdBy: authz.userId
				}
			});
			return NextResponse.json({ asset: toSummary(asset) }, { status: 201 });
		} catch (error) {
			// 메타데이터 저장이 실패하면 방금 올린 오브젝트를 정리해요 — 참조 없는 고아 파일을 남기지 않기 위해
			console.error("Failed to save guild asset metadata:", error);
			await deleteAssetObject(ASSET_BUCKET, key).catch(() => undefined);
			return NextResponse.json({ error: "요청을 처리하지 못했어요." }, { status: 500 });
		}
	},
});
