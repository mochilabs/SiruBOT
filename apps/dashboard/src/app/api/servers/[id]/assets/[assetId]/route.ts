import { NextResponse } from "next/server";
import { assetNameSchema } from "@sirubot/utils/storage";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { WRITE_RATE } from "@/lib/rate-limit";
import { parseSettingBody } from "@/lib/schemas";
import { deleteAssetObject } from "@/lib/storage";

const assetRenameSchema = z.object({ name: assetNameSchema });

export const PATCH = createGuildApiHandler({
	role: "manage",
	rate: WRITE_RATE,
	key: "asset-rename",
	handler: async ({ guildId, params, request }) => {
		const { assetId } = params;
		try {
			const body = await parseSettingBody(request, assetRenameSchema, ["name"]);
			if (!body.ok) return body.response;

			const existing = await db.guildAsset.findFirst({ where: { id: assetId, guildId } });
			if (!existing) {
				return NextResponse.json({ error: "찾을 수 없는 이미지예요." }, { status: 404 });
			}

			const asset = await db.guildAsset.update({ where: { id: existing.id }, data: { name: body.data.name } });
			return NextResponse.json({
				asset: {
					id: asset.id,
					name: asset.name,
					url: asset.url,
					mimeType: asset.mimeType,
					sizeBytes: asset.sizeBytes,
					createdAt: asset.createdAt.toISOString()
				}
			});
		} catch (error) {
			console.error("Failed to rename guild asset:", error);
			return NextResponse.json({ error: "요청을 처리하지 못했어요." }, { status: 500 });
		}
	},
});

export const DELETE = createGuildApiHandler({
	role: "manage",
	rate: WRITE_RATE,
	key: "asset-delete",
	handler: async ({ guildId, params }) => {
		const { assetId } = params;
		try {
			const asset = await db.guildAsset.findFirst({ where: { id: assetId, guildId } });
			if (!asset) {
				return NextResponse.json({ error: "찾을 수 없는 이미지예요." }, { status: 404 });
			}

			const commands = await db.customCommand.findMany({ where: { guildId }, select: { name: true, spec: true } });
			const referencedBy = commands.filter((command) => JSON.stringify(command.spec).includes(asset.url)).map((command) => command.name);

			try {
				await deleteAssetObject(asset.bucket, asset.key);
			} catch (error) {
				console.error(`Failed to delete guild asset object (guild ${guildId}):`, error);
				return NextResponse.json(
					{ error: error instanceof Error ? error.message : "이미지를 삭제하지 못했어요. 잠시 후 다시 시도해 주세요." },
					{ status: 502 },
				);
			}

			await db.guildAsset.delete({ where: { id: asset.id } });
			return NextResponse.json({ ok: true, referencedBy });
		} catch (error) {
			console.error("Failed to delete guild asset:", error);
			return NextResponse.json({ error: "요청을 처리하지 못했어요." }, { status: 500 });
		}
	},
});
