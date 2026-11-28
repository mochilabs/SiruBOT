import { NextResponse } from "next/server";
import { CHAT_TOOL_MODES, EMBED_FIX_SITES, EMBED_FIX_TRANSLATE_LANGS } from "@sirubot/utils/chatTools";
import {
	AI_MODES,
	AUTOMIX_MAX_TEMPO_CHANGE_RANGE,
	AUTOMIX_MIN_CONFIDENCE_RANGE,
	CROSSFADE_MS_RANGE,
	JTC_TEMPLATE_MAX_LENGTH,
	JTC_USER_LIMIT_RANGE,
	MUSIC_VOLUME_RANGE,
	REPEAT_MODE_DEFAULT,
	REPEAT_MODES,
	SPONSORBLOCK_SEGMENTS,
	TEXT_CHANNEL_MODE_DEFAULT,
	TEXT_CHANNEL_MODES,
	THEME_PRESET_DEFAULT,
	THEME_PRESETS,
	TTS_ANNOUNCE_MODE_DEFAULT,
	TTS_ANNOUNCE_MODES,
	TTS_DUCK_LEVEL_RANGE,
	TTS_VOLUME_RANGE,
} from "@sirubot/utils/guildSettingsContract";
import { BOT_MODULES } from "@sirubot/utils/modules";
import { z } from "zod";

const snowflake = z.string().regex(/^\d{17,20}$/, "올바른 ID 형식이 아니에요.");
const nullableSnowflake = snowflake.nullable();

export const aiSettingsSchema = z.object({
	mode: z.enum(AI_MODES, "모드는 all / channels / off만 가능해요.").optional(),
	channelIds: z.array(snowflake, "채널 ID 목록이 잘못됐어요.").max(500, "허용 채널은 최대 500개까지 등록할 수 있어요.").optional(),
});

export const guildSettingsSchema = z.object({
	volume: z
		.number()
		.int("볼륨은 정수여야 해요.")
		.min(MUSIC_VOLUME_RANGE.min, `볼륨은 ${MUSIC_VOLUME_RANGE.min} 이상이에요.`)
		.max(MUSIC_VOLUME_RANGE.max, `볼륨은 ${MUSIC_VOLUME_RANGE.max} 이하여야 해요.`)
		.optional(),
	ttsVolume: z
		.number()
		.int("볼륨은 정수여야 해요.")
		.min(TTS_VOLUME_RANGE.min, `볼륨은 ${TTS_VOLUME_RANGE.min} 이상이에요.`)
		.max(TTS_VOLUME_RANGE.max, `볼륨은 ${TTS_VOLUME_RANGE.max} 이하여야 해요.`)
		.optional(),
	ttsDuckLevel: z
		.number()
		.min(TTS_DUCK_LEVEL_RANGE.min, "덕킹 비율은 0 이상이에요.")
		.max(TTS_DUCK_LEVEL_RANGE.max, "덕킹 비율은 1 이하여야 해요.")
		.optional(),
	repeat: z.enum(REPEAT_MODES, "반복 모드가 잘못됐어요.").optional(),
	related: z.boolean().optional(),
	enableController: z.boolean().optional(),
	sponsorBlockSegments: z.array(z.enum(SPONSORBLOCK_SEGMENTS, "SponsorBlock 구간이 잘못됐어요.")).max(SPONSORBLOCK_SEGMENTS.length).optional(),
	djRoleId: nullableSnowflake.optional(),
	textChannelId: nullableSnowflake.optional(),
	voiceChannelId: nullableSnowflake.optional(),
	textChannelInputPlay: z.boolean().optional(),
	textChannelMode: z.enum(TEXT_CHANNEL_MODES, "채팅 입력 재생 동작이 잘못됐어요.").optional(),
	textChannelDeleteInput: z.boolean().optional(),
	jtcEnabled: z.boolean().optional(),
	jtcCategoryId: nullableSnowflake.optional(),
	jtcMarkerChannelId: nullableSnowflake.optional(),
	jtcTemplate: z
		.string()
		.min(1, "방 이름 템플릿은 비울 수 없어요.")
		.max(JTC_TEMPLATE_MAX_LENGTH, `템플릿은 ${JTC_TEMPLATE_MAX_LENGTH}자 이하여야 해요.`)
		.optional(),
	jtcUserLimit: z
		.number()
		.int("인원 제한은 정수여야 해요.")
		.min(JTC_USER_LIMIT_RANGE.min, "인원 제한은 0 이상이에요.")
		.max(JTC_USER_LIMIT_RANGE.max, `인원 제한은 ${JTC_USER_LIMIT_RANGE.max} 이하여야 해요.`)
		.optional(),
	gaplessEnabled: z.boolean().optional(),
	crossfadeEnabled: z.boolean().optional(),
	automixEnabled: z.boolean().optional(),
	automixMaxTempoChange: z
		.number()
		.min(AUTOMIX_MAX_TEMPO_CHANGE_RANGE.min, "템포 변경은 0% 이상이에요.")
		.max(AUTOMIX_MAX_TEMPO_CHANGE_RANGE.max, "템포 변경은 12% 이하여야 해요.")
		.optional(),
	automixMinConfidence: z
		.number()
		.min(AUTOMIX_MIN_CONFIDENCE_RANGE.min, "분석 신뢰도는 0 이상이에요.")
		.max(AUTOMIX_MIN_CONFIDENCE_RANGE.max, "분석 신뢰도는 1 이하여야 해요.")
		.optional(),
	crossfadeMs: z
		.number()
		.int("크로스페이드는 정수여야 해요.")
		.min(CROSSFADE_MS_RANGE.min, "크로스페이드는 0.5초 이상이에요.")
		.max(CROSSFADE_MS_RANGE.max, "크로스페이드는 15초 이하여야 해요.")
		.optional(),
	normalizationEnabled: z.boolean().optional(),
	ttsAnnounceMode: z.enum(TTS_ANNOUNCE_MODES).optional().default(TTS_ANNOUNCE_MODE_DEFAULT),
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
	embedFixTranslateLang: z.enum(EMBED_FIX_TRANSLATE_LANGS, "임베드 번역 언어가 잘못됐어요.").optional(),
	countingEnabled: z.boolean().optional(),
	countingChannelId: nullableSnowflake.optional(),
	// Omit .default() so partial PUTs do not overwrite themePreset.
	themePreset: z.enum(THEME_PRESETS, "테마가 잘못됐어요.").optional(),
	disabledModules: z.array(z.string().max(32, "모듈 ID가 잘못됐어요."), "모듈 목록이 잘못됐어요.").max(BOT_MODULES.length, "모듈 목록이 잘못됐어요.").optional(),
});

export const GUILD_SETTING_KEYS = Object.keys(guildSettingsSchema.shape);

export type GuildSettings = Required<z.infer<typeof guildSettingsSchema>>;

export const GUILD_SETTINGS_DEFAULTS = {
	volume: 10,
	ttsVolume: 100,
	ttsDuckLevel: 0.2,
	repeat: REPEAT_MODE_DEFAULT,
	related: false,
	enableController: true,
	sponsorBlockSegments: [],
	djRoleId: null,
	textChannelId: null,
	voiceChannelId: null,
	textChannelInputPlay: false,
	textChannelMode: TEXT_CHANNEL_MODE_DEFAULT,
	textChannelDeleteInput: false,
	jtcEnabled: false,
	jtcCategoryId: null,
	jtcMarkerChannelId: null,
	jtcTemplate: "{user}의 방",
	jtcUserLimit: 0,
	gaplessEnabled: true,
	crossfadeEnabled: true,
	automixEnabled: false,
	automixMaxTempoChange: 0.06,
	automixMinConfidence: 0.30,
	crossfadeMs: 5000,
	normalizationEnabled: false,
	ttsAnnounceMode: TTS_ANNOUNCE_MODE_DEFAULT,
	emojiEnlargeMode: "off",
	emojiEnlargeChannelIds: [],
	quoteMode: "off",
	quoteChannelIds: [],
	embedFixMode: "off",
	embedFixChannelIds: [],
	embedFixSites: [],
	embedFixSuppressOriginal: false,
	embedFixTranslateLang: "off",
	countingEnabled: false,
	countingChannelId: null,
	themePreset: THEME_PRESET_DEFAULT,
	disabledModules: [],
} satisfies GuildSettings;

export const jtcSetupSchema = z.object({
	categoryId: snowflake,
	markerChannelName: z
		.string()
		.trim()
		.min(1, "마커 채널 이름을 입력해 주세요.")
		.max(100, "마커 채널 이름은 100자 이하로 입력해 주세요.")
		.optional(),
});

function unknownKeys(body: unknown, allowed: readonly string[]): string[] {
	if (!body || typeof body !== "object" || Array.isArray(body)) return [];
	return Object.keys(body).filter((key) => !allowed.includes(key));
}

export function zodError(error: z.ZodError): string {
	const issue = error.issues[0];
	if (!issue) return "잘못된 요청이에요.";
	const path = issue.path.join(".");
	return path ? `${path}: ${issue.message}` : issue.message;
}

export type SettingBodyResult<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

export async function parseSettingBody<S extends z.ZodTypeAny>(
	request: Request,
	schema: S,
	allowedKeys: readonly string[],
	invalidMessage?: string,
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
		return { ok: false, response: NextResponse.json({ error: invalidMessage ?? zodError(parsed.error) }, { status: 400 }) };
	}
	return { ok: true, data: parsed.data };
}
