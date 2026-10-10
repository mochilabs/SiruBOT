import { z } from "zod";

import type { GreetingConfig, PresetBackground } from "@/types/member-greeting";

/**
 * 멤버 인사 설정의 zod 검증 — packages/utils/src/memberGreeting.ts의 복제본이에요.
 * utils 배럴을 런타임에서 임포트하면 @sentry/node 같은 노드 의존이 번들 경로에 끼어 터보팩 빌드가
 * 실패해요 (discordjs/ws module-not-found). 그래서 대시보드 라우트는 이 복제본으로 검증하고,
 * 계약이 바뀌면 원본과 여기는 같이 업데이트해요.
 */

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const SNOWFLAKE = /^\d{17,20}$/;
// jpeg 표기 허용 (image/jpeg). base64 본문은 URL-safe가 아닌 표준 알파벳만 허용.
const DATA_URI = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const DATA_URI_MAX_LENGTH = 1_500_000; // prefix 포함 문자 길이 ≈ 1.1MB 바이너리 상한

const PRESET_BACKGROUND_IDS = ["rose", "plum", "gold"] as const satisfies readonly Extract<
	PresetBackground["id"],
	string
>[];

export const greetingTextSchema = z.object({
	text: z.string(),
	x: z.number().min(0).max(100),
	y: z.number().min(0).max(100),
	size: z.number().min(12).max(72),
	color: z.string().regex(HEX_COLOR),
	bold: z.boolean(),
});

export const greetingImageSchema = z.object({
	background: z.strictObject({
		presetId: z
			.string()
			.refine((presetId) => (PRESET_BACKGROUND_IDS as readonly string[]).includes(presetId), {
				error: "알 수 없는 배경 프리셋",
			})
			.nullable(),
		dataUri: z.string().regex(DATA_URI).max(DATA_URI_MAX_LENGTH).nullable(),
	}),
	showAvatar: z.boolean(),
	title: greetingTextSchema,
	subtitle: greetingTextSchema,
});

export const greetingConfigSchema = z
	.object({
		version: z.literal(1),
		enabled: z.boolean(),
		channelId: z.string().regex(SNOWFLAKE).nullable(),
		template: z.string().max(500),
		useImage: z.boolean(),
		image: greetingImageSchema.nullable(),
	})
	.refine((config) => (config.useImage ? config.image !== null : true), {
		error: "useImage가 true일 때 image는 필수예요.",
	});

/** GET에서 읽은 저장 값 검증 — 유효하면 타입 있는 설정, 아니면 null (UI가 기본값으로 폴백해요) */
export function validateGreetingConfig(value: unknown): GreetingConfig | null {
	const result = greetingConfigSchema.safeParse(value);
	return result.success ? result.data : null;
}