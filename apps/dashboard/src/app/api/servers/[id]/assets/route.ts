import { NextResponse } from "next/server";
import { ASSET_ALLOWED_MIME_TYPES, ASSET_BUCKET, ASSET_MAX_BYTES, ASSET_NAME_MAX_LENGTH, assetKeyFor, sniffImageMime } from "@sirubot/utils/storage";

import { createGuildApiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { READ_RATE, UPLOAD_RATE } from "@/lib/rate-limit";
import { deleteAssetObject, putAssetObject, type PutAssetResult } from "@/lib/storage";

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

		const rawName = file.name.split(/[\\/]/).pop()?.trim() ?? "";
		const name = (rawName || "이미지").slice(0, ASSET_NAME_MAX_LENGTH);

		try {
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
			console.error("Failed to save guild asset metadata:", error);
			await deleteAssetObject(ASSET_BUCKET, key).catch(() => undefined);
			return NextResponse.json({ error: "요청을 처리하지 못했어요." }, { status: 500 });
		}
	},
});
