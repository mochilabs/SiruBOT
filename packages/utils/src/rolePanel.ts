import { z } from 'zod';
import { redisIdSchema } from './redisChannels.js';

// customId `rolepanel:grant:<buttonId>:<roleId>` embeds the roleId so an already posted button keeps granting the role it showed,
// even if an admin later changes the button's role.
// Posting and validation need the bot token, so they go through Redis request/reply (redisChannels.ts, panelPost.ts).

/** Discord allows 5 buttons per row × 5 rows. */
export const ROLE_PANEL_MAX_BUTTONS = 25;
/** Discord's button label limit. */
export const ROLE_PANEL_BUTTON_LABEL_MAX = 80;
export const ROLE_PANEL_TITLE_MAX = 100;
export const ROLE_PANEL_DESCRIPTION_MAX = 1000;
export const ROLE_PANEL_NAME_MAX = 100;
/** `#RRGGBB`; null uses the bot default. */
export const ROLE_PANEL_ACCENT_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
export const ROLE_PANEL_IMAGE_URL_MAX = 2048;

/** A panel uses one mode or the other. */
export const rolePanelModes = ['button', 'reaction'] as const;
export type RolePanelMode = (typeof rolePanelModes)[number];
export const rolePanelImageLayouts = ['gallery', 'thumbnail'] as const;
export type RolePanelImageLayout = (typeof rolePanelImageLayouts)[number];
/** Thumbnails have no position option. */
export const rolePanelImagePositions = ['top', 'middle', 'bottom'] as const;
export type RolePanelImagePosition = (typeof rolePanelImagePositions)[number];
/** Discord allows 20 distinct reaction emoji per message. */
export const ROLE_PANEL_MAX_REACTIONS = 20;

export const rolePanelButtonStyles = ['secondary', 'primary', 'success', 'danger'] as const;
export type RolePanelButtonStyle = (typeof rolePanelButtonStyles)[number];

const snowflake = z.string().regex(/^\d{17,20}$/, '올바른 ID 형식이 아니에요.');
const nullableSnowflake = snowflake.nullable();

// Built with the constructor: a `v`-flag literal fails to parse at lower targets.
const UNICODE_EMOJI = new RegExp('^\\p{RGI_Emoji}$', 'v');
const CUSTOM_EMOJI = /^<a?:\w{2,32}:\d{17,20}>$/;

export function isValidRolePanelEmoji(value: string): boolean {
	return UNICODE_EMOJI.test(value) || CUSTOM_EMOJI.test(value);
}

/** Normalizes reaction-event and stored emoji to one key: custom emoji by id, unicode without the U+FE0F variation selector. */
export function rolePanelEmojiKey(value: string): string {
	const custom = /^<a?:\w{2,32}:(\d{17,20})>$/.exec(value);
	return custom ? custom[1] : value.replaceAll('\uFE0F', '');
}

/** Returns the violation message or null. In reaction mode a button is a reaction, so each needs a unique emoji. */
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

/** New buttons omit the id (the server issues one); existing ones keep theirs so posted customIds stay valid. */
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
export const rolePanelImageUrlSchema = z
	.string()
	.trim()
	.url('올바른 이미지 주소 형식이 아니에요.')
	.max(ROLE_PANEL_IMAGE_URL_MAX, `이미지 주소는 ${ROLE_PANEL_IMAGE_URL_MAX}자 이하여야 해요.`)
	.refine((url) => /^https?:\/\//i.test(url), { message: '이미지 주소는 http 또는 https 주소여야 해요.' });

const rolePanelAccentColorSchema = z.string().regex(ROLE_PANEL_ACCENT_COLOR_PATTERN, '강조색은 #RRGGBB 형식이어야 해요.');

export const rolePanelSchema = z.object({
	name: rolePanelNameSchema,
	title: rolePanelTitleSchema.default('역할 패널'),
	description: rolePanelDescriptionSchema.default('아래 버튼을 눌러 원하는 역할을 받거나 해제하세요.'),
	imageUrl: rolePanelImageUrlSchema.nullable().optional().default(null),
	imageLayout: z.enum(rolePanelImageLayouts).optional().default('gallery'),
	imagePosition: z.enum(rolePanelImagePositions).optional().default('middle'),
	accentColor: rolePanelAccentColorSchema.nullable().optional().default(null),
	channelId: nullableSnowflake.optional().default(null),
	messageId: nullableSnowflake.optional().default(null)
});
export type RolePanel = z.infer<typeof rolePanelSchema>;

/** The list replaces all buttons: it is the final state. */
export const rolePanelButtonsSchema = z
	.array(rolePanelButtonInputSchema)
	.max(ROLE_PANEL_MAX_BUTTONS, `역할 버튼은 최대 ${ROLE_PANEL_MAX_BUTTONS}개까지 설정할 수 있어요.`)
	.refine((buttons) => new Set(buttons.map((b) => b.id).filter(Boolean)).size === buttons.filter((b) => b.id).length, '버튼 ID가 중복됐어요.');

export const rolePanelCreateSchema = z
	.object({
		name: rolePanelNameSchema,
		title: rolePanelTitleSchema.optional(),
		description: rolePanelDescriptionSchema.optional(),
		imageUrl: rolePanelImageUrlSchema.nullable().optional().default(null),
		imageLayout: z.enum(rolePanelImageLayouts).optional().default('gallery'),
		imagePosition: z.enum(rolePanelImagePositions).optional().default('middle'),
		accentColor: rolePanelAccentColorSchema.nullable().optional().default(null),
		mode: z.enum(rolePanelModes).optional().default('button'),
		buttons: rolePanelButtonsSchema.optional().default([])
	})
	.superRefine((value, ctx) => {
		const reason = value.mode === 'reaction' ? validateReactionButtons(value.buttons) : null;
		if (reason) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['buttons'], message: reason });
	});

export const rolePanelUpdateSchema = z
	.object({
		name: rolePanelNameSchema.optional(),
		title: rolePanelTitleSchema.optional(),
		description: rolePanelDescriptionSchema.optional(),
		imageUrl: rolePanelImageUrlSchema.nullable().optional(),
		imageLayout: z.enum(rolePanelImageLayouts).optional(),
		imagePosition: z.enum(rolePanelImagePositions).optional(),
		accentColor: rolePanelAccentColorSchema.nullable().optional(),
		mode: z.enum(rolePanelModes).optional(),
		buttons: rolePanelButtonsSchema.optional()
	})
	.superRefine((value, ctx) => {
		// with only one of mode/buttons present, the route checks it against the stored value
		const reason = value.mode === 'reaction' && value.buttons ? validateReactionButtons(value.buttons) : null;
		if (reason) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['buttons'], message: reason });
	});

export const roleValidationRequestSchema = z.object({
	requestId: z.string().uuid(),
	guildId: redisIdSchema,
	roleIds: z.array(snowflake).max(ROLE_PANEL_MAX_BUTTONS)
});

/** `error` carries a Korean message on failure such as a communication fault. */
export const roleValidationResponseSchema = z.object({
	requestId: z.string().uuid(),
	guildId: redisIdSchema,
	error: z.string().optional(),
	invalidRoleIds: z.array(snowflake).optional()
});
export type RoleValidationResponse = z.infer<typeof roleValidationResponseSchema>;
