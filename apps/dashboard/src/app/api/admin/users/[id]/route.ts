import { NextResponse } from "next/server";
import { Prisma } from "@sirubot/prisma";
import { createEmptyMemorySections, renderMemoryMarkdown } from "@sirubot/utils/memoryFile";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { READ_RATE, WRITE_RATE } from "@/lib/rate-limit";
import { parseSettingBody } from "@/lib/schemas";

const snowflakeSchema = z.string().regex(/^\d{17,20}$/, "올바른 Discord 유저 ID 형식이 아니에요.");

const adminUserPatchSchema = z.object({
	birthMonth: z.number().int().min(1).max(12).nullable().optional(),
	birthDay: z.number().int().min(1).max(31).nullable().optional(),
	intro: z.string().trim().max(120).nullable().optional(),
	longTermMemory: z.string().max(20_000).nullable().optional(),
	clearShortTermMemory: z.boolean().optional(),
	clearGameRecords: z.boolean().optional(),
	clearTtsSettings: z.boolean().optional(),
});

const ALLOWED_KEYS = Object.keys(adminUserPatchSchema.shape);

function normalizeStoredLongTerm(stored: unknown): string {
	if (typeof stored === "string" && stored.trim().length > 0) {
		return stored;
	}
	return renderMemoryMarkdown(createEmptyMemorySections());
}

async function loadUserDetail(userId: string) {
	const [user, memory, ttsCount] = await Promise.all([
		db.user.findUnique({
			where: { id: userId },
			include: {
				_count: {
					select: {
						playlists: true,
						gameRecords: true,
						history: true,
					},
				},
			},
		}),
		db.userMemory.findUnique({ where: { userId } }),
		db.ttsUserSetting.count({ where: { userId } }),
	]);

	if (!user && !memory) return null;

	return {
		id: userId,
		birthMonth: user?.birthMonth ?? null,
		birthDay: user?.birthDay ?? null,
		intro: user?.intro ?? null,
		longTermMemory: normalizeStoredLongTerm(memory?.longTerm),
		shortTermTurns: Array.isArray(memory?.shortTerm) ? memory.shortTerm : [],
		tidiedAt: memory?.tidiedAt ? memory.tidiedAt.toISOString() : null,
		counts: {
			playlists: user?._count.playlists ?? 0,
			gameRecords: user?._count.gameRecords ?? 0,
			history: user?._count.history ?? 0,
			ttsSettings: ttsCount,
		},
		createdAt: user?.createdAt.toISOString() ?? null,
		updatedAt: user?.updatedAt.toISOString() ?? memory?.updatedAt.toISOString() ?? null,
	};
}

export const GET = createGuildApiHandler({
	role: "admin",
	rate: READ_RATE,
	key: "admin-user-detail-get",
	handler: async ({ params }) => {
		const idParsed = snowflakeSchema.safeParse(params.id);
		if (!idParsed.success) {
			return NextResponse.json({ error: "올바른 Discord 유저 ID 형식이 아니에요." }, { status: 400 });
		}
		try {
			const detail = await loadUserDetail(idParsed.data);
			if (!detail) {
				return NextResponse.json({ error: "등록된 유저 데이터를 찾을 수 없어요." }, { status: 404 });
			}
			return NextResponse.json({ user: detail });
		} catch (error) {
			console.error("Failed to fetch admin user detail:", error);
			return NextResponse.json({ error: "유저 상세 정보를 불러오지 못했어요." }, { status: 500 });
		}
	},
});

export const PATCH = createGuildApiHandler({
	role: "admin",
	rate: WRITE_RATE,
	key: "admin-user-detail-patch",
	handler: async ({ params, request }) => {
		const idParsed = snowflakeSchema.safeParse(params.id);
		if (!idParsed.success) {
			return NextResponse.json({ error: "올바른 Discord 유저 ID 형식이 아니에요." }, { status: 400 });
		}
		const userId = idParsed.data;
		const parsed = await parseSettingBody(request, adminUserPatchSchema, ALLOWED_KEYS);
		if (!parsed.ok) return parsed.response;

		const data = parsed.data;
		const userUpdate: { birthMonth?: number | null; birthDay?: number | null; intro?: string | null } = {};
		if (data.birthMonth !== undefined) userUpdate.birthMonth = data.birthMonth;
		if (data.birthDay !== undefined) userUpdate.birthDay = data.birthDay;
		if (data.intro !== undefined) userUpdate.intro = data.intro && data.intro.length > 0 ? data.intro : null;

		try {
			if (Object.keys(userUpdate).length > 0) {
				await db.user.upsert({
					where: { id: userId },
					create: { id: userId, ...userUpdate },
					update: userUpdate,
				});
			}

			if (data.longTermMemory !== undefined || data.clearShortTermMemory) {
				const memUpdate: Prisma.UserMemoryUpdateInput = {};
				const memCreate: Prisma.UserMemoryCreateInput = { userId };

				if (data.longTermMemory !== undefined) {
					if (data.longTermMemory === null || data.longTermMemory.trim().length === 0) {
						memUpdate.longTerm = Prisma.DbNull;
						memCreate.longTerm = Prisma.DbNull;
					} else {
						memUpdate.longTerm = data.longTermMemory;
						memCreate.longTerm = data.longTermMemory;
					}
				}
				if (data.clearShortTermMemory) {
					memUpdate.shortTerm = [];
					memCreate.shortTerm = [];
				}
				await db.userMemory.upsert({
					where: { userId },
					create: memCreate,
					update: memUpdate,
				});
			}

			if (data.clearGameRecords) {
				await db.gameRecord.deleteMany({ where: { userId } });
			}
			if (data.clearTtsSettings) {
				await db.ttsUserSetting.deleteMany({ where: { userId } });
			}

			const detail = await loadUserDetail(userId);
			return NextResponse.json({ user: detail });
		} catch (error) {
			console.error("Failed to update admin user:", error);
			return NextResponse.json({ error: "유저 데이터를 수정하지 못했어요." }, { status: 500 });
		}
	},
});

export const DELETE = createGuildApiHandler({
	role: "admin",
	rate: WRITE_RATE,
	key: "admin-user-detail-delete",
	handler: async ({ params }) => {
		const idParsed = snowflakeSchema.safeParse(params.id);
		if (!idParsed.success) {
			return NextResponse.json({ error: "올바른 Discord 유저 ID 형식이 아니에요." }, { status: 400 });
		}
		const userId = idParsed.data;
		try {
			await Promise.all([
				db.userMemory.deleteMany({ where: { userId } }),
				db.ttsUserSetting.deleteMany({ where: { userId } }),
				db.gameRecord.deleteMany({ where: { userId } }),
				db.user.updateMany({
					where: { id: userId },
					data: { birthMonth: null, birthDay: null, intro: null },
				}),
			]);
			return NextResponse.json({ ok: true });
		} catch (error) {
			console.error("Failed to purge user data:", error);
			return NextResponse.json({ error: "유저 개인정보 초기화에 실패했어요." }, { status: 500 });
		}
	},
});
