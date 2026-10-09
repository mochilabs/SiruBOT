import { z } from "zod";

/* ─────────────────────────── 상수 ─────────────────────────── */

const AI_MODES = ["all", "channels", "off"] as const;
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

/* ─────────────────────────── 스키마 ─────────────────────────── */

const snowflake = z.string().regex(/^\d{17,20}$/, "올바른 ID 형식이 아니에요.");
const nullableSnowflake = snowflake.nullable();

/** PUT /api/servers/[id]/ai */
export const aiSettingsSchema = z.object({
	mode: z.enum(AI_MODES, "모드는 all / channels / off만 가능해요.").optional(),
	channelIds: z.array(snowflake, "채널 ID 목록이 잘못됐어요.").max(500, "허용 채널은 최대 500개까지 등록할 수 있어요.").optional(),
});

/** PUT /api/servers/[id]/settings */
export const guildSettingsSchema = z.object({
	volume: z.number().int("볼륨은 정수여야 해요.").min(0, "볼륨은 0 이상이에요.").max(150, "볼륨은 150 이하여야 해요.").optional(),
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
		.min(500, "크로스페이드는 500ms 이상이에요.")
		.max(30000, "크로스페이드는 30000ms 이하여야 해요.")
		.optional(),
});

/** POST /api/servers/[id]/jtc/setup */
export const jtcSetupSchema = z.object({
	categoryId: snowflake,
});

/* ─────────────────────────── 헬퍼 ─────────────────────────── */

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

/** DB에 저장된 모드 값을 안전하게 정규화해요 */
export function normalizeAiMode(value: string | null | undefined): "all" | "channels" | "off" {
	return value && (AI_MODES as readonly string[]).includes(value) ? (value as "all" | "channels" | "off") : "all";
}
