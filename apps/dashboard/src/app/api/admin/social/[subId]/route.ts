import { NextResponse } from "next/server";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { forwardDataApiPost } from "@/lib/data-api/client";
import { db } from "@/lib/db";
import { WRITE_RATE } from "@/lib/rate-limit";
import { parseSettingBody } from "@/lib/schemas";

const uuidSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "올바른 구독 ID 형식이 아니에요.");

const adminSocialPatchSchema = z.object({
	status: z.enum(["active", "failed", "disabled"]).optional(),
	sourceName: z.string().trim().min(1).max(120).optional(),
	messageTemplate: z.string().trim().min(1).max(1000).nullable().optional(),
	webhookName: z.string().trim().min(1).max(80).nullable().optional(),
	showThumbnail: z.boolean().optional(),
});

const ALLOWED_KEYS = Object.keys(adminSocialPatchSchema.shape);

export const PATCH = createGuildApiHandler({
	role: "admin",
	rate: WRITE_RATE,
	key: "admin-social-patch",
	handler: async ({ params, request }) => {
		const idParsed = uuidSchema.safeParse(params.subId);
		if (!idParsed.success) {
			return NextResponse.json({ error: "올바른 구독 ID 형식이 아니에요." }, { status: 400 });
		}
		const subId = idParsed.data;
		const parsed = await parseSettingBody(request, adminSocialPatchSchema, ALLOWED_KEYS);
		if (!parsed.ok) return parsed.response;

		const existing = await db.socialSubscription.findUnique({
			where: { id: subId },
			select: { id: true, guildId: true },
		});
		if (!existing) {
			return NextResponse.json({ error: "찾을 수 없는 소셜 알림 구독이에요." }, { status: 404 });
		}

		const data = parsed.data;
		try {
			const updated = await db.socialSubscription.update({
				where: { id: subId },
				data,
				select: {
					id: true,
					guildId: true,
					platform: true,
					sourcePlatformId: true,
					sourceName: true,
					targetChannelId: true,
					messageTemplate: true,
					webhookName: true,
					webhookAvatarUrl: true,
					showThumbnail: true,
					status: true,
					createdAt: true,
					updatedAt: true,
				},
			});

			return NextResponse.json({
				subscription: {
					...updated,
					createdAt: updated.createdAt.toISOString(),
					updatedAt: updated.updatedAt.toISOString(),
				},
			});
		} catch (error) {
			console.error("Failed to update admin social subscription:", error);
			return NextResponse.json({ error: "소셜 알림 구독을 수정하지 못했어요." }, { status: 500 });
		}
	},
});

export const DELETE = createGuildApiHandler({
	role: "admin",
	rate: WRITE_RATE,
	key: "admin-social-delete",
	handler: async ({ params }) => {
		const idParsed = uuidSchema.safeParse(params.subId);
		if (!idParsed.success) {
			return NextResponse.json({ error: "올바른 구독 ID 형식이 아니에요." }, { status: 400 });
		}
		const subId = idParsed.data;

		const existing = await db.socialSubscription.findUnique({
			where: { id: subId },
			select: { id: true, guildId: true },
		});
		if (!existing) {
			return NextResponse.json({ error: "찾을 수 없는 소셜 알림 구독이에요." }, { status: 404 });
		}

		try {
			const proxyRes = await forwardDataApiPost<{ ok: boolean }>(
				`/v1/guilds/${encodeURIComponent(existing.guildId)}/social/subscriptions/${encodeURIComponent(subId)}`,
				undefined,
				{ method: "DELETE" },
			);
			if (!proxyRes.ok) {
				await db.socialSubscription.delete({ where: { id: subId } });
			}
			return NextResponse.json({ ok: true });
		} catch (error) {
			console.error("Failed to delete admin social subscription:", error);
			return NextResponse.json({ error: "소셜 알림 구독을 삭제하지 못했어요." }, { status: 500 });
		}
	},
});
