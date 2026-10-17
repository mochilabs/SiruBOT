import { NextResponse } from "next/server";
import { assetNameSchema } from "@sirubot/utils";
import { z } from "zod";

import { authorizeGuildManage, deniedGuildManage } from "@/lib/api-guards";
import { db } from "@/lib/db";
import { guardRateLimit, rateKey, WRITE_RATE } from "@/lib/rate-limit";
import { parseSettingBody } from "@/lib/schemas";
import { deleteAssetObject } from "@/lib/storage";

/** 이름 변경 — 보내준 `name`만 바꿔요 (공용 스키마: 공백 거부·60자 이하) */
const assetRenameSchema = z.object({ name: assetNameSchema });

/** PATCH /api/servers/[id]/assets/[assetId] — 에셋 이름 변경 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; assetId: string }> }) {
	const { id, assetId } = await params;
	const authz = await authorizeGuildManage(id);
	if (!authz.ok) return deniedGuildManage(authz);

	const limited = await guardRateLimit(rateKey("asset-rename", authz.userId, id), WRITE_RATE);
	if (limited) return limited;

	try {
		const body = await parseSettingBody(request, assetRenameSchema, ["name"]);
		if (!body.ok) return body.response;

		// 소유 검증 — 다른 길드의 에셋은 건드릴 수 없어요
		const existing = await db.guildAsset.findFirst({ where: { id: assetId, guildId: id } });
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
}

/**
 * DELETE /api/servers/[id]/assets/[assetId] — 스토리지 오브젝트와 메타데이터를 함께 지워요.
 * 커스텀 명령어 스펙이 이 에셋 URL을 쓰고 있으면 이름을 `referencedBy`로 알려주지만 삭제는 진행해요.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; assetId: string }> }) {
	const { id, assetId } = await params;
	const authz = await authorizeGuildManage(id);
	if (!authz.ok) return deniedGuildManage(authz);

	const limited = await guardRateLimit(rateKey("asset-delete", authz.userId, id), WRITE_RATE);
	if (limited) return limited;

	try {
		const asset = await db.guildAsset.findFirst({ where: { id: assetId, guildId: id } });
		if (!asset) {
			return NextResponse.json({ error: "찾을 수 없는 이미지예요." }, { status: 404 });
		}

		// 참조 스캔 — 스펙 JSON에 이 에셋 URL이 들어간 커스텀 명령어 이름을 모아요 (경고용, 삭제는 계속)
		const commands = await db.customCommand.findMany({ where: { guildId: id }, select: { name: true, spec: true } });
		const referencedBy = commands.filter((command) => JSON.stringify(command.spec).includes(asset.url)).map((command) => command.name);

		try {
			// 404는 이미 없는 파일이라 성공 취급해요 (deleteAssetObject 계약)
			await deleteAssetObject(asset.bucket, asset.key);
		} catch (error) {
			console.error(`Failed to delete guild asset object (guild ${id}):`, error);
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
}
