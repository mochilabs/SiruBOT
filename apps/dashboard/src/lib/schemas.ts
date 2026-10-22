import { NextResponse } from "next/server";
import { EMBED_FIX_SITES } from "@sirubot/utils/chatTools";
import { z } from "zod";

import { PLAYER_VOLUME_MAX } from "@/lib/player-constants";
import type { GuildSettings } from "@/types/settings";

const AI_MODES = ["all", "channels", "off"] as const;
const CHAT_TOOL_MODES = ["all", "channels", "off"] as const;
const REPEAT_MODES = ["off", "track", "queue"] as const;
const PINNED_MODES = ["play", "select"] as const;
export const SPONSORBLOCK_SEGMENTS = [
	"sponsor",
	"selfpromo",
	"interaction",
	"intro",
	"outro",
	"preview",
	"music_offtopic",
	"filler",
] as const;

const snowflake = z.string().regex(/^\d{17,20}$/, "올바른 ID 형식이 아니에요.");
const nullableSnowflake = snowflake.nullable();

/** PUT /api/servers/[id]/ai */
export const aiSettingsSchema = z.object({
	mode: z.enum(AI_MODES, "모드는 all / channels / off만 가능해요.").optional(),
	channelIds: z.array(snowflake, "채널 ID 목록이 잘못됐어요.").max(500, "허용 채널은 최대 500개까지 등록할 수 있어요.").optional(),
});

/** PUT /api/servers/[id]/settings */
export const guildSettingsSchema = z.object({
	volume: z.number().int("볼륨은 정수여야 해요.").min(0, "볼륨은 0 이상이에요.").max(PLAYER_VOLUME_MAX, `볼륨은 ${PLAYER_VOLUME_MAX} 이하여야 해요.`).optional(),
	repeat: z.enum(REPEAT_MODES, "반복 모드가 잘못됐어요.").optional(),
	related: z.boolean().optional(),
	enableController: z.boolean().optional(),
	sponsorBlockSegments: z.array(z.enum(SPONSORBLOCK_SEGMENTS, "SponsorBlock 구간이 잘못됐어요.")).max(8).optional(),
	djRoleId: nullableSnowflake.optional(),
	textChannelId: nullableSnowflake.optional(),
	voiceChannelId: nullableSnowflake.optional(),
	pinnedChannelId: nullableSnowflake.optional(),
	pinnedChannelMode: z.enum(PINNED_MODES, "고정 채널 동작이 잘못됐어요.").optional(),
	pinnedChannelDeleteInput: z.boolean().optional(),
	jtcEnabled: z.boolean().optional(),
	jtcCategoryId: nullableSnowflake.optional(),
	jtcMarkerChannelId: nullableSnowflake.optional(),
	jtcTemplate: z.string().min(1, "방 이름 템플릿은 비울 수 없어요.").max(100, "템플릿은 100자 이하여야 해요.").optional(),
	jtcUserLimit: z.number().int("인원 제한은 정수여야 해요.").min(0, "인원 제한은 0 이상이에요.").max(99, "인원 제한은 99 이하여야 해요.").optional(),
	gaplessEnabled: z.boolean().optional(),
	crossfadeEnabled: z.boolean().optional(),
	crossfadeMs: z
		.number()
		.int("크로스페이드는 정수여야 해요.")
		.min(500, "크로스페이드는 0.5초 이상이에요.")
		.max(15000, "크로스페이드는 15초 이하여야 해요.")
		.optional(),
	// 채팅 유틸 — 봇 계약: packages/utils/src/chatTools.ts, 채널 토글: 봇 guildService의 ChatToolSettings
	emojiEnlargeMode: z.enum(CHAT_TOOL_MODES, "이모지 확대 모드가 잘못됐어요.").optional(),
	emojiEnlargeChannelIds: z.array(snowflake, "채널 ID 목록이 잘못됐어요.").max(500, "허용 채널은 최대 500개까지 등록할 수 있어요.").optional(),
	quoteMode: z.enum(CHAT_TOOL_MODES, "메시지 인용 모드가 잘못됐어요.").optional(),
	quoteChannelIds: z.array(snowflake, "채널 ID 목록이 잘못됐어요.").max(500, "허용 채널은 최대 500개까지 등록할 수 있어요.").optional(),
	embedFixMode: z.enum(CHAT_TOOL_MODES, "임베드 복구 모드가 잘못됐어요.").optional(),
	embedFixChannelIds: z.array(snowflake, "채널 ID 목록이 잘못됐어요.").max(500, "허용 채널은 최대 500개까지 등록할 수 있어요.").optional(),
	embedFixSites: z
		.array(z.enum(EMBED_FIX_SITES, "임베드 복구 사이트가 잘못됐어요."))
		.max(EMBED_FIX_SITES.length, `사이트는 최대 ${EMBED_FIX_SITES.length}개까지 선택할 수 있어요.`)
		.optional(),
	embedFixSuppressOriginal: z.boolean().optional(),
	countingEnabled: z.boolean().optional(),
	countingChannelId: nullableSnowflake.optional(),
});

/**
 * PUT /api/servers/[id]/settings 허용 키 — zod 스키마에서 도출해 ALLOWED_KEYS와 스키마가
 * 어긋나는(유효 필드 거부·미등록 키 통과) 드리프트를 구조적으로 막아요.
 */
export const GUILD_SETTING_KEYS = Object.keys(guildSettingsSchema.shape);

/** 계약 정합 가드 — 스키마와 GuildSettings(응답 타입)의 키가 어긋나면 컴파일 오류로 알려줘요 */
type AssertSameKeys<A, B> = [keyof A] extends [keyof B] ? ([keyof B] extends [keyof A] ? true : never) : never;
type Assert<T extends true> = T;
export type GuildSettingsContractOk = Assert<AssertSameKeys<z.infer<typeof guildSettingsSchema>, GuildSettings>>;

/** POST /api/servers/[id]/jtc/setup */
export const jtcSetupSchema = z.object({
	categoryId: snowflake,
});

/** 미등록 필드를 조용히 무시하지 말고 알려줘요 (기존 AI 라우트의 동작 유지) */
export function unknownKeys(body: unknown, allowed: readonly string[]): string[] {
	if (!body || typeof body !== "object" || Array.isArray(body)) return [];
	return Object.keys(body).filter((key) => !allowed.includes(key));
}

/** zod 실패 메시지를 한국어 400 응답으로 정리해요 */
export function zodError(error: z.ZodError): string {
	const issue = error.issues[0];
	if (!issue) return "잘못된 요청이에요.";
	const path = issue.path.join(".");
	return path ? `${path}: ${issue.message}` : issue.message;
}

export type SettingBodyResult<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

/**
 * 설정 라우트(PUT/PATCH) 본문 검증 공통 흐름 — JSON 파싱·객체 형태·미등록 필드·스키마를
 * 한 번에 검사하고 실패 시 그에 맞는 400 응답을 돌려줘요. 라우트는 결과의 ok만 보면 돼요.
 */
export async function parseSettingBody<S extends z.ZodTypeAny>(
	request: Request,
	schema: S,
	allowedKeys: readonly string[],
): Promise<SettingBodyResult<z.infer<S>>> {
	const body: unknown = await request.json().catch(() => null);
	if (!body || typeof body !== "object" || Array.isArray(body)) {
		return { ok: false, response: NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 }) };
	}

	const unknown = unknownKeys(body, allowedKeys);
	if (unknown.length > 0) {
		return {
			ok: false,
			response: NextResponse.json(
				{ error: `지원하지 않는 필드예요: ${unknown.join(", ")}` },
				{ status: 400 },
			),
		};
	}

	const parsed = schema.safeParse(body);
	if (!parsed.success) {
		return { ok: false, response: NextResponse.json({ error: zodError(parsed.error) }, { status: 400 }) };
	}
	return { ok: true, data: parsed.data };
}

/** DB에 저장된 모드 값을 안전하게 정규화해요 */
export function normalizeAiMode(value: string | null | undefined): "all" | "channels" | "off" {
	return value && (AI_MODES as readonly string[]).includes(value) ? (value as "all" | "channels" | "off") : "all";
}

/** 채팅 유틸 모드 정규화 — 봇 기본값은 꺼짐(off)이에요 */
export function normalizeChatToolMode(value: string | null | undefined): "all" | "channels" | "off" {
	return value && (CHAT_TOOL_MODES as readonly string[]).includes(value) ? (value as "all" | "channels" | "off") : "off";
}
