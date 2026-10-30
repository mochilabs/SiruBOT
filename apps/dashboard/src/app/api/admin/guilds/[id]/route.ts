import { NextResponse } from "next/server";
import { normalizeChatToolMode, normalizeEmbedFixTranslateLang } from "@sirubot/utils/chatTools";
import { validateCustomCommandPrefix } from "@sirubot/utils/customCommand";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { notifyGuildSettingsChanged } from "@/lib/data-api/client";
import { db } from "@/lib/db";
import { PLAYER_VOLUME_MAX } from "@/lib/player-constants";
import { READ_RATE, WRITE_RATE } from "@/lib/rate-limit";
import { normalizeAiMode, parseSettingBody } from "@/lib/schemas";

const snowflakeSchema = z.string().regex(/^\d{17,20}$/, "올바른 Discord 서버 ID 형식이 아니에요.");
const nullableSnowflake = snowflakeSchema.nullable();

const adminGuildPatchSchema = z.object({
	volume: z.number().int().min(0).max(PLAYER_VOLUME_MAX).optional(),
	ttsVolume: z.number().int().min(0).max(200).optional(),
	ttsDuckLevel: z.number().min(0).max(1).optional(),
	repeat: z.enum(["off", "track", "queue"]).optional(),
	related: z.boolean().optional(),
	enableController: z.boolean().optional(),
	djRoleId: nullableSnowflake.optional(),
	textChannelId: nullableSnowflake.optional(),
	voiceChannelId: nullableSnowflake.optional(),
	pinnedChannelId: nullableSnowflake.optional(),
	pinnedChannelMode: z.enum(["play", "select"]).optional(),
	pinnedChannelDeleteInput: z.boolean().optional(),
	jtcEnabled: z.boolean().optional(),
	jtcCategoryId: nullableSnowflake.optional(),
	jtcMarkerChannelId: nullableSnowflake.optional(),
	jtcTemplate: z.string().trim().min(1).max(80).optional(),
	jtcUserLimit: z.number().int().min(0).max(99).optional(),
	gaplessEnabled: z.boolean().optional(),
	crossfadeEnabled: z.boolean().optional(),
	crossfadeMs: z.number().int().min(1000).max(10000).optional(),
	normalizationEnabled: z.boolean().optional(),
	ttsAnnounceMode: z.enum(["sequential", "parallel", "interrupt"]).optional(),
	aiMode: z.enum(["all", "channels", "off"]).optional(),
	ttsMode: z.enum(["all", "channels", "off"]).optional(),
	customCommandPrefix: z
		.string()
		.superRefine((val, ctx) => {
			const err = validateCustomCommandPrefix(val);
			if (err) {
				ctx.addIssue({ code: "custom", message: err });
			}
		})
		.optional(),
	emojiEnlargeMode: z.enum(["all", "channels", "off"]).optional(),
	quoteMode: z.enum(["all", "channels", "off"]).optional(),
	embedFixMode: z.enum(["all", "channels", "off"]).optional(),
	embedFixSuppressOriginal: z.boolean().optional(),
	embedFixTranslateLang: z.enum(["off", "ko", "ja", "en"]).optional(),
	countingEnabled: z.boolean().optional(),
	countingChannelId: nullableSnowflake.optional(),
	clearChatHistory: z.boolean().optional(),
});

const ALLOWED_KEYS = Object.keys(adminGuildPatchSchema.shape);

async function loadGuildDetail(guildId: string) {
	const [guild, chatHistoryCount, socialSubsCount] = await Promise.all([
		db.guild.findUnique({
			where: { id: guildId },
			include: {
				ticketConfig: true,
				_count: {
					select: {
						customCommands: true,
						assets: true,
						tickets: true,
						history: true,
					},
				},
			},
		}),
		db.channelChatHistory.count({ where: { guildId } }),
		db.socialSubscription.count({ where: { guildId } }),
	]);
	if (!guild) return null;

	return {
		id: guild.id,
		volume: guild.volume,
		ttsVolume: guild.ttsVolume,
		ttsDuckLevel: guild.ttsDuckLevel,
		repeat: ["off", "track", "queue"].includes(guild.repeat) ? guild.repeat : "off",
		related: guild.related,
		enableController: guild.enableController,
		djRoleId: guild.djRoleId,
		textChannelId: guild.textChannelId,
		voiceChannelId: guild.voiceChannelId,
		pinnedChannelId: guild.pinnedChannelId,
		pinnedChannelMode: ["play", "select"].includes(guild.pinnedChannelMode) ? guild.pinnedChannelMode : "play",
		pinnedChannelDeleteInput: guild.pinnedChannelDeleteInput,
		jtcEnabled: guild.jtcEnabled,
		jtcCategoryId: guild.jtcCategoryId,
		jtcMarkerChannelId: guild.jtcMarkerChannelId,
		jtcTemplate: guild.jtcTemplate,
		jtcUserLimit: guild.jtcUserLimit,
		gaplessEnabled: guild.gaplessEnabled,
		crossfadeEnabled: guild.crossfadeEnabled,
		crossfadeMs: guild.crossfadeMs,
		normalizationEnabled: guild.normalizationEnabled,
		ttsAnnounceMode: ["sequential", "parallel", "interrupt"].includes(guild.ttsAnnounceMode)
			? guild.ttsAnnounceMode
			: "sequential",
		aiMode: normalizeAiMode(guild.aiMode),
		ttsMode: normalizeChatToolMode(guild.ttsMode),
		customCommandPrefix: guild.customCommandPrefix,
		emojiEnlargeMode: normalizeChatToolMode(guild.emojiEnlargeMode),
		quoteMode: normalizeChatToolMode(guild.quoteMode),
		embedFixMode: normalizeChatToolMode(guild.embedFixMode),
		embedFixSuppressOriginal: guild.embedFixSuppressOriginal,
		embedFixTranslateLang: normalizeEmbedFixTranslateLang(guild.embedFixTranslateLang),
		countingEnabled: guild.countingEnabled,
		countingChannelId: guild.countingChannelId,
		ticketConfig: guild.ticketConfig,
		counts: {
			customCommands: guild._count.customCommands,
			assets: guild._count.assets,
			tickets: guild._count.tickets,
			history: guild._count.history,
			chatHistoryChannels: chatHistoryCount,
			socialSubscriptions: socialSubsCount,
		},
		createdAt: guild.createdAt.toISOString(),
		updatedAt: guild.updatedAt.toISOString(),
	};
}

export const GET = createGuildApiHandler({
	role: "admin",
	rate: READ_RATE,
	key: "admin-guild-detail-get",
	handler: async ({ params }) => {
		const idParsed = snowflakeSchema.safeParse(params.id);
		if (!idParsed.success) {
			return NextResponse.json({ error: "올바른 Discord 서버 ID 형식이 아니에요." }, { status: 400 });
		}
		try {
			const detail = await loadGuildDetail(idParsed.data);
			if (!detail) {
				return NextResponse.json({ error: "등록된 서버 데이터를 찾을 수 없어요." }, { status: 404 });
			}
			return NextResponse.json({ guild: detail });
		} catch (error) {
			console.error("Failed to fetch admin guild detail:", error);
			return NextResponse.json({ error: "서버 상세 정보를 불러오지 못했어요." }, { status: 500 });
		}
	},
});

export const PATCH = createGuildApiHandler({
	role: "admin",
	rate: WRITE_RATE,
	key: "admin-guild-detail-patch",
	handler: async ({ params, request }) => {
		const idParsed = snowflakeSchema.safeParse(params.id);
		if (!idParsed.success) {
			return NextResponse.json({ error: "올바른 Discord 서버 ID 형식이 아니에요." }, { status: 400 });
		}
		const guildId = idParsed.data;
		const parsed = await parseSettingBody(request, adminGuildPatchSchema, ALLOWED_KEYS);
		if (!parsed.ok) return parsed.response;

		const { clearChatHistory, ...fields } = parsed.data;
		const updateData: Record<string, unknown> = { ...fields };

		if (fields.ttsAnnounceMode !== undefined) {
			updateData.ttsParallelEnabled = fields.ttsAnnounceMode === "parallel";
		}
		if (fields.customCommandPrefix !== undefined) {
			updateData.customCommandPrefix = fields.customCommandPrefix.trim();
		}

		try {
			if (Object.keys(updateData).length > 0) {
				await db.guild.upsert({
					where: { id: guildId },
					create: { id: guildId, ...updateData },
					update: updateData,
				});
			}

			if (clearChatHistory) {
				await db.channelChatHistory.deleteMany({ where: { guildId } });
			}

			const touchesMixer = ["gaplessEnabled", "crossfadeEnabled", "crossfadeMs", "normalizationEnabled"].some(
				(key) => key in updateData,
			);
			notifyGuildSettingsChanged(guildId, touchesMixer ? "mixer" : undefined).catch((error) => {
				console.warn(`Failed to notify guild settings change from admin (guild ${guildId}):`, error);
			});

			const detail = await loadGuildDetail(guildId);
			return NextResponse.json({ guild: detail });
		} catch (error) {
			console.error("Failed to update admin guild:", error);
			return NextResponse.json({ error: "서버 데이터를 수정하지 못했어요." }, { status: 500 });
		}
	},
});

export const DELETE = createGuildApiHandler({
	role: "admin",
	rate: WRITE_RATE,
	key: "admin-guild-detail-delete",
	handler: async ({ params }) => {
		const idParsed = snowflakeSchema.safeParse(params.id);
		if (!idParsed.success) {
			return NextResponse.json({ error: "올바른 Discord 서버 ID 형식이 아니에요." }, { status: 400 });
		}
		const guildId = idParsed.data;
		try {
			await Promise.all([
				db.channelChatHistory.deleteMany({ where: { guildId } }),
				db.ttsUserSetting.deleteMany({ where: { guildId } }),
				db.guild.deleteMany({ where: { id: guildId } }),
			]);
			notifyGuildSettingsChanged(guildId).catch(() => null);
			return NextResponse.json({ ok: true });
		} catch (error) {
			console.error("Failed to delete guild data:", error);
			return NextResponse.json({ error: "서버 데이터를 삭제하지 못했어요." }, { status: 500 });
		}
	},
});
