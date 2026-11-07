import { z } from 'zod';
import { redisIdSchema } from './redisChannels.js';

/**
 * 역할 패널(Role Panel) 계약 — 길드당 여러 개(1:N)의 패널을 만들고, 유저가 버튼 클릭으로
 * 자기 역할을 토글(부여/제거)하는 기능. 봇·data-api·대시보드가 함께 쓰는 순수 계약이에요.
 *
 * - customId: `rolepanel:grant:<buttonId>:<roleId>` — roleId를 임베드해 "버튼이 게시될 당시
 *   가리킨 역할"을 스냅샷으로 고정해요. 관리자가 게시 후 버튼의 roleId를 바꿔도, 이미 게시된
 *   메시지의 버튼은 게시 당시 역할을 계속 부여해요 (버튼이 보여준 것과 실제 부여가 일치).
 * - 게시/검증은 봇 토큰으로만 가능한 작업이라(data-api·대시보드는 유저 OAuth 토큰만), Redis
 *   request/reply로 우회해요 — 채널·스키마는 redisChannels.ts / panelPost.ts 계약이에요.
 */

/** 버튼·역할 customId 접두사 — 핸들러가 이 prefix로 파싱해요. */
export const ROLE_PANEL_CUSTOM_ID_PREFIX = 'rolepanel:grant:';

/** 패널당 최대 역할 버튼 수 — Discord 버튼 5개/행 × 5행 = 25개. */
export const ROLE_PANEL_MAX_BUTTONS = 25;
/** 버튼 라벨 최대 길이 (Discord 버튼 라벨 상한 80자). */
export const ROLE_PANEL_BUTTON_LABEL_MAX = 80;
/** 패널 제목 최대 길이. */
export const ROLE_PANEL_TITLE_MAX = 100;
/** 패널 안내문 최대 길이. */
export const ROLE_PANEL_DESCRIPTION_MAX = 1000;
/** 패널 식별 이름 최대 길이 (대시보드 목록·autocomplete에 표시). */
export const ROLE_PANEL_NAME_MAX = 100;

/** 역할을 받는 방식 — 버튼 클릭 또는 이모지 반응. 한 패널은 둘 중 하나만 써요. */
export const rolePanelModes = ['button', 'reaction'] as const;
export type RolePanelMode = (typeof rolePanelModes)[number];
/** 반응 모드의 최대 역할 수 — Discord는 메시지당 서로 다른 반응 이모지를 20개까지만 허용해요. */
export const ROLE_PANEL_MAX_REACTIONS = 20;

/** 버튼 스타일 — Discord ButtonStyle 중 역할 패널이 쓰는 4종. */
export const rolePanelButtonStyles = ['secondary', 'primary', 'success', 'danger'] as const;
export type RolePanelButtonStyle = (typeof rolePanelButtonStyles)[number];

const snowflake = z.string().regex(/^\d{17,20}$/, '올바른 ID 형식이 아니에요.');
const nullableSnowflake = snowflake.nullable();

/**
 * customId 빌더 — `rolepanel:grant:<buttonId>:<roleId>`.
 * buttonId는 uuid(36자), roleId는 snowflake(최대 20자) → 전체 ≈ 15 + 36 + 1 + 20 = 72자 < 100자 상한.
 */
export function buildRolePanelCustomId(buttonId: string, roleId: string): string {
	return `${ROLE_PANEL_CUSTOM_ID_PREFIX}${buttonId}:${roleId}`;
}

/** customId 파서 — 이 prefix가 아니면 null, 맞으면 { buttonId, roleId }. */
export function parseRolePanelCustomId(customId: string): { buttonId: string; roleId: string } | null {
	if (!customId.startsWith(ROLE_PANEL_CUSTOM_ID_PREFIX)) return null;
	const rest = customId.slice(ROLE_PANEL_CUSTOM_ID_PREFIX.length);
	const sep = rest.indexOf(':');
	if (sep === -1 || sep === 0 || sep === rest.length - 1) return null;
	return { buttonId: rest.slice(0, sep), roleId: rest.slice(sep + 1) };
}

// 유니코드 이모지(RGI) — v 플래그 리터럴은 낮은 target에서 파싱이 깨져 생성자로 만들어요.
const UNICODE_EMOJI = new RegExp('^\\p{RGI_Emoji}$', 'v');
// 커스텀 이모지 — `<:name:id>` / `<a:name:id>`.
const CUSTOM_EMOJI = /^<a?:\w{2,32}:\d{17,20}>$/;

/** 버튼 이모지로 쓸 수 있는 값인지 — 유니코드 이모지 한 개 또는 커스텀 이모지 마크업. */
export function isValidRolePanelEmoji(value: string): boolean {
	return UNICODE_EMOJI.test(value) || CUSTOM_EMOJI.test(value);
}

/**
 * 이모지 비교 키 — 반응 이벤트의 이모지와 저장된 값을 같은 형태로 맞춰요.
 * 커스텀 이모지는 id, 유니코드는 변형 선택자(U+FE0F)를 뗀 문자 그대로예요.
 */
export function rolePanelEmojiKey(value: string): string {
	const custom = /^<a?:\w{2,32}:(\d{17,20})>$/.exec(value);
	return custom ? custom[1] : value.replaceAll('\uFE0F', '');
}

/**
 * 반응 모드의 버튼 규칙 검사 — 위반 사유(한국어) 또는 null.
 * 버튼이 곧 반응이라 모든 버튼에 이모지가 필요하고, 같은 이모지는 한 번만 쓸 수 있어요.
 */
export function validateReactionButtons(buttons: ReadonlyArray<{ emoji?: string | null }>): string | null {
	if (buttons.length > ROLE_PANEL_MAX_REACTIONS) {
		return `반응 방식은 역할을 최대 ${ROLE_PANEL_MAX_REACTIONS}개까지 설정할 수 있어요.`;
	}
	const seen = new Set<string>();
	for (const button of buttons) {
		if (!button.emoji) return '반응 방식에서는 모든 역할에 이모지를 지정해야 해요.';
		const key = rolePanelEmojiKey(button.emoji);
		if (seen.has(key)) return '반응 방식에서는 같은 이모지를 두 번 쓸 수 없어요.';
		seen.add(key);
	}
	return null;
}

/** 역할 패널 버튼 — 패널에 노출할 역할 하나와 표시 메타데이터. */
export const rolePanelButtonSchema = z.object({
	id: z.string().min(1),
	roleId: snowflake,
	label: z.string().min(1, '버튼 라벨을 입력해 주세요.').max(ROLE_PANEL_BUTTON_LABEL_MAX, `라벨은 ${ROLE_PANEL_BUTTON_LABEL_MAX}자 이하여야 해요.`),
	emoji: z
		.string()
		.max(100)
		.refine(isValidRolePanelEmoji, '올바른 이모지가 아니에요. 유니코드 이모지나 서버 커스텀 이모지만 쓸 수 있어요.')
		.nullable()
		.optional()
		.default(null),
	style: z.enum(rolePanelButtonStyles).default('secondary'),
	position: z.number().int().min(0).default(0)
});
export type RolePanelButton = z.infer<typeof rolePanelButtonSchema>;

/**
 * 패널 생성/편집용 버튼 입력 — 새 버튼은 id 없이 보내고(서버가 발급), 기존 버튼은 uuid id를 실어
 * 보내요. id를 유지해야 이미 게시된 메시지의 customId가 계속 유효해요.
 */
export const rolePanelButtonInputSchema = rolePanelButtonSchema
	.omit({ id: true })
	.partial({ position: true })
	.extend({ id: z.string().uuid().optional() });
export type RolePanelButtonInput = z.infer<typeof rolePanelButtonInputSchema>;

const rolePanelNameSchema = z
	.string()
	.min(1, '패널 이름을 입력해 주세요.')
	.max(ROLE_PANEL_NAME_MAX, `이름은 ${ROLE_PANEL_NAME_MAX}자 이하여야 해요.`);
const rolePanelTitleSchema = z
	.string()
	.min(1, '패널 제목을 입력해 주세요.')
	.max(ROLE_PANEL_TITLE_MAX, `제목은 ${ROLE_PANEL_TITLE_MAX}자 이하여야 해요.`);
const rolePanelDescriptionSchema = z
	.string()
	.min(1, '패널 안내문을 입력해 주세요.')
	.max(ROLE_PANEL_DESCRIPTION_MAX, `안내문은 ${ROLE_PANEL_DESCRIPTION_MAX}자 이하여야 해요.`);

/** 패널 전체 계약 (생성 시 기본값 포함). */
export const rolePanelSchema = z.object({
	name: rolePanelNameSchema,
	title: rolePanelTitleSchema.default('역할 패널'),
	description: rolePanelDescriptionSchema.default('아래 버튼을 눌러 원하는 역할을 받거나 해제하세요.'),
	channelId: nullableSnowflake.optional().default(null),
	messageId: nullableSnowflake.optional().default(null)
});
export type RolePanel = z.infer<typeof rolePanelSchema>;

/**
 * 패널 생성/편집 시 버튼 목록 계약 — 버튼 전체 교체(리스트가 곧 최종 상태).
 * 상한: 최대 25개 (Discord 버튼 5/행 × 5행).
 */
export const rolePanelButtonsSchema = z
	.array(rolePanelButtonInputSchema)
	.max(ROLE_PANEL_MAX_BUTTONS, `역할 버튼은 최대 ${ROLE_PANEL_MAX_BUTTONS}개까지 설정할 수 있어요.`)
	.refine((buttons) => new Set(buttons.map((b) => b.id).filter(Boolean)).size === buttons.filter((b) => b.id).length, '버튼 ID가 중복됐어요.');

/** 대시보드 생성 API 본문 — 이름 필수, 나머지는 서버 기본값. 한도는 위 공용 상수에서 와요. */
export const rolePanelCreateSchema = z
	.object({
		name: rolePanelNameSchema,
		title: rolePanelTitleSchema.optional(),
		description: rolePanelDescriptionSchema.optional(),
		mode: z.enum(rolePanelModes).optional().default('button'),
		buttons: rolePanelButtonsSchema.optional().default([])
	})
	.superRefine((value, ctx) => {
		const reason = value.mode === 'reaction' ? validateReactionButtons(value.buttons) : null;
		if (reason) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['buttons'], message: reason });
	});

/** 대시보드 수정 API 본문(PUT) — 필드는 부분 수정, buttons가 오면 목록 전체가 최종 상태예요. */
export const rolePanelUpdateSchema = z
	.object({
		name: rolePanelNameSchema.optional(),
		title: rolePanelTitleSchema.optional(),
		description: rolePanelDescriptionSchema.optional(),
		mode: z.enum(rolePanelModes).optional(),
		buttons: rolePanelButtonsSchema.optional()
	})
	.superRefine((value, ctx) => {
		// mode와 buttons가 함께 올 때만 여기서 검사해요. 한쪽만 오면 저장된 값과 합쳐 라우트가 검사해요.
		const reason = value.mode === 'reaction' && value.buttons ? validateReactionButtons(value.buttons) : null;
		if (reason) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['buttons'], message: reason });
	});

export const ROLE_PANEL_DEFAULTS: RolePanel = {
	name: '',
	title: '역할 패널',
	description: '아래 버튼을 눌러 원하는 역할을 받거나 해제하세요.',
	channelId: null,
	messageId: null
};

/**
 * 역할 유효성 검증 request — 대시보드가 저장 전에 roleIds를 봇에 보내 부여 가능 여부를 확인해요.
 * 채널: ROLE_VALIDATION_REQUEST_CHANNEL / ROLE_VALIDATION_RESPONSE_CHANNEL (redisChannels.ts)
 */
export const roleValidationRequestSchema = z.object({
	requestId: z.string().uuid(),
	guildId: redisIdSchema,
	roleIds: z.array(snowflake).max(ROLE_PANEL_MAX_BUTTONS)
});

/**
 * 역할 유효성 검증 응답 — invalidRoleIds는 봇이 부여할 수 없다고 판정한 역할 목록.
 * 실패(통신 장애 등)는 error에 한국어 안내를 실어요.
 */
export const roleValidationResponseSchema = z.object({
	requestId: z.string().uuid(),
	guildId: redisIdSchema,
	error: z.string().optional(),
	invalidRoleIds: z.array(snowflake).optional()
});
export type RoleValidationResponse = z.infer<typeof roleValidationResponseSchema>;
