import { z } from 'zod';

export const CUSTOM_COMMAND_SPEC_VERSION = 2;

export const CUSTOM_COMMAND_MAX_STEPS = 20;
export const CUSTOM_COMMAND_MAX_STEP_DELAY_SECONDS = 300;
export const CUSTOM_COMMAND_MAX_TOTAL_DELAY_SECONDS = 600;
export const CUSTOM_COMMAND_MAX_PER_GUILD = 20;
export const CUSTOM_COMMAND_MAX_SLASH_PER_GUILD = 20;
export const CUSTOM_COMMAND_MAX_ARGS = 5;
export const CUSTOM_COMMAND_IF_MAX_SUB_STEPS = 10;

export const CUSTOM_COMMAND_NAME_MAX_LENGTH = 20;
export const CUSTOM_COMMAND_NAME_PATTERN = /^\S+$/u;
export const CUSTOM_COMMAND_SLASH_NAME_PATTERN = /^[-_\p{L}\p{N}]{1,32}$/u;

// Keep in sync with top-level slash commands so prefix commands don't shadow them.
export const CUSTOM_COMMAND_RESERVED_NAMES = [
	'도움말',
	'음악',
	'재생',
	'건너뛰기',
	'대기열',
	'지금재생',
	'플레이리스트',
	'즐겨찾기',
	'설정',
	'정보',
	'프로필',
	'출석',
	'주사위',
	'숫자맞히기',
	'가위바위보',
	'오하아사',
	'날씨',
	'택배',
	'티켓',
	'채팅',
	'청소',
	'초대',
	'핑'
] as const;

export const CUSTOM_COMMAND_PREFIX_DEFAULT = '!';
export const CUSTOM_COMMAND_PREFIX_MAX_LENGTH = 3;
export const CUSTOM_COMMAND_PREFIX_PATTERN = /^\S+$/;

const snowflakeSchema = z.string().regex(/^\d{17,20}$/, '올바른 대상을 선택해 주세요.');
const httpsUrlSchema = z
	.string()
	.url('이미지 주소가 올바르지 않아요.')
	.regex(/^https:\/\//u, 'https 주소만 사용할 수 있어요.');

export const customCommandMethodSchema = z.enum(['prefix', 'slash']);
export type CustomCommandMethod = z.infer<typeof customCommandMethodSchema>;

export const customCommandAccessSchema = z
	.object({
		mode: z.enum(['everyone', 'roles', 'permissions']),
		roleIds: z.array(snowflakeSchema).max(10).optional(),
		permissions: z
			.array(z.enum(['ManageRoles', 'ManageChannels', 'ManageMessages', 'Administrator']))
			.max(4)
			.optional()
	})
	.superRefine((access, ctx) => {
		if (access.mode === 'roles' && (!access.roleIds || access.roleIds.length === 0)) {
			ctx.addIssue({ code: 'custom', message: '허용 역할을 1개 이상 선택해 주세요.' });
		}
		if (access.mode === 'permissions' && (!access.permissions || access.permissions.length === 0)) {
			ctx.addIssue({ code: 'custom', message: '허용 권한을 1개 이상 선택해 주세요.' });
		}
	});
export type CustomCommandAccess = z.infer<typeof customCommandAccessSchema>;

export const CUSTOM_COMMAND_ACCENT_COLORS = ['blue', 'green', 'red', 'purple', 'gray'] as const;
export type CustomCommandAccentColor = (typeof CUSTOM_COMMAND_ACCENT_COLORS)[number];

export const CUSTOM_COMMAND_ACCENT_COLOR_VALUES: Record<CustomCommandAccentColor, number> = {
	blue: 0x5865f2,
	green: 0x57f287,
	red: 0xed4245,
	purple: 0x9b59b6,
	gray: 0x95a5a6
};

export const cv2DesignItemSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('text'), content: z.string().min(1, '내용을 입력해 주세요.').max(2000, '텍스트는 2000자 이하여야 해요.') }),
	z.object({ kind: z.literal('separator') }),
	z.object({
		kind: z.literal('section'),
		content: z.string().min(1, '내용을 입력해 주세요.').max(2000, '텍스트는 2000자 이하여야 해요.'),
		thumbnailUrl: httpsUrlSchema
	}),
	z.object({
		kind: z.literal('media'),
		urls: z.array(httpsUrlSchema).min(1, '이미지를 1개 이상 추가해 주세요.').max(10, '이미지는 10개 이하로 넣을 수 있어요.')
	})
]);

export const cv2DesignSchema = z.object({
	accentColor: z.enum(CUSTOM_COMMAND_ACCENT_COLORS).default('blue'),
	items: z.array(cv2DesignItemSchema).min(1, '구성 요소를 1개 이상 추가해 주세요.').max(10, '구성 요소는 10개 이하로 넣을 수 있어요.')
});
export type CustomCommandDesign = z.infer<typeof cv2DesignSchema>;
export type CustomCommandDesignItem = z.infer<typeof cv2DesignItemSchema>;

const sendMessageStepSchema = z.object({
	type: z.literal('send_message'),
	text: z.string().min(1, '메시지를 입력해 주세요.').max(2000, '메시지는 2000자 이하여야 해요.').optional(),
	design: cv2DesignSchema.optional()
});

const delayStepSchema = z.object({
	type: z.literal('delay'),
	seconds: z
		.number()
		.int('대기 시간은 정수(초)여야 해요.')
		.min(1, '대기 시간은 1초 이상이에요.')
		.max(CUSTOM_COMMAND_MAX_STEP_DELAY_SECONDS, `대기 시간은 ${CUSTOM_COMMAND_MAX_STEP_DELAY_SECONDS}초 이하여야 해요.`)
});

const addRoleStepSchema = z.object({ type: z.literal('add_role'), roleId: snowflakeSchema });
const removeRoleStepSchema = z.object({ type: z.literal('remove_role'), roleId: snowflakeSchema });
const addReactionStepSchema = z.object({
	type: z.literal('add_reaction'),
	emoji: z.string().min(1, '이모지를 입력해 주세요.').max(100, '이모지는 100자 이하여야 해요.')
});
const pinMessageStepSchema = z.object({ type: z.literal('pin_message') });
const deleteTriggerStepSchema = z.object({
	type: z.literal('delete_trigger'),
	afterSeconds: z.number().int('삭제 대기는 정수(초)여야 해요.').min(1, '삭제 대기는 1초 이상이에요.').max(60, '삭제 대기는 60초 이하여야 해요.')
});

export const ifConditionSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('has_role'), roleId: snowflakeSchema }),
	z.object({ kind: z.literal('channel_match'), channelId: snowflakeSchema }),
	z.object({
		kind: z.literal('arg_matches'),
		index: z
			.number()
			.int()
			.min(0)
			.max(CUSTOM_COMMAND_MAX_ARGS - 1),
		value: z.string().min(1, '비교할 값을 입력해 주세요.').max(100)
	})
]);
export type CustomCommandIfCondition = z.infer<typeof ifConditionSchema>;

export const nonIfStepSchema = z.discriminatedUnion('type', [
	sendMessageStepSchema,
	delayStepSchema,
	addRoleStepSchema,
	removeRoleStepSchema,
	addReactionStepSchema,
	pinMessageStepSchema,
	deleteTriggerStepSchema
]);

const ifStepSchema = z.object({
	type: z.literal('if'),
	condition: ifConditionSchema,
	then: z
		.array(nonIfStepSchema)
		.min(1, '조건이 맞을 때 실행할 스텝을 1개 이상 추가해 주세요.')
		.max(CUSTOM_COMMAND_IF_MAX_SUB_STEPS, `조건부 스텝은 ${CUSTOM_COMMAND_IF_MAX_SUB_STEPS}개 이하로 넣을 수 있어요.`),
	else: z
		.array(nonIfStepSchema)
		.max(CUSTOM_COMMAND_IF_MAX_SUB_STEPS, `조건부 스텝은 ${CUSTOM_COMMAND_IF_MAX_SUB_STEPS}개 이하로 넣을 수 있어요.`)
		.optional()
});

export const customCommandStepSchema = z.discriminatedUnion('type', [
	sendMessageStepSchema,
	delayStepSchema,
	addRoleStepSchema,
	removeRoleStepSchema,
	addReactionStepSchema,
	pinMessageStepSchema,
	deleteTriggerStepSchema,
	ifStepSchema
]);

const sendMessageStepSchemaV1 = z.object({
	type: z.literal('send_message'),
	text: z.string().min(1, '메시지를 입력해 주세요.').max(2000, '메시지는 2000자 이하여야 해요.')
});
export const customCommandStepSchemaV1 = z.discriminatedUnion('type', [sendMessageStepSchemaV1, delayStepSchema]);

type StepLike = { type: string; seconds?: number; text?: string; design?: unknown; then?: StepLike[]; else?: StepLike[] };

function walkSteps(steps: StepLike[], visit: (step: StepLike) => void): void {
	for (const step of steps) {
		visit(step);
		if (step.type === 'if') {
			walkSteps(step.then ?? [], visit);
			walkSteps(step.else ?? [], visit);
		}
	}
}

function totalDelaySeconds(steps: StepLike[]): number {
	let total = 0;
	walkSteps(steps, (step) => {
		if (step.type === 'delay' && typeof step.seconds === 'number') total += step.seconds;
	});
	return total;
}

const specObjectV2 = z.object({
	version: z.literal(CUSTOM_COMMAND_SPEC_VERSION, '스펙 버전이 올바르지 않아요.'),
	access: customCommandAccessSchema.optional(),
	steps: z
		.array(customCommandStepSchema)
		.min(1, '스텝은 1개 이상이어야 해요.')
		.max(CUSTOM_COMMAND_MAX_STEPS, `스텝은 ${CUSTOM_COMMAND_MAX_STEPS}개 이하로 넣을 수 있어요.`)
});

export const customCommandSpecSchemaV2 = specObjectV2.superRefine((spec, ctx) => {
	walkSteps(spec.steps, (step) => {
		if (step.type === 'send_message' && step.text === undefined && step.design === undefined) {
			ctx.addIssue({ code: 'custom', message: '보낼 내용(텍스트 또는 디자인)을 입력해 주세요.' });
		}
	});
	// Role actions require access restriction; walkSteps checks nested if branches too.
	let hasRoleAction = false;
	walkSteps(spec.steps, (step) => {
		if (step.type === 'add_role' || step.type === 'remove_role') hasRoleAction = true;
	});
	if (hasRoleAction && (spec.access === undefined || spec.access.mode === 'everyone')) {
		ctx.addIssue({ code: 'custom', message: '역할 변경 액션은 실행 제한(역할/권한)이 필요해요.' });
	}
	if (totalDelaySeconds(spec.steps) > CUSTOM_COMMAND_MAX_TOTAL_DELAY_SECONDS) {
		ctx.addIssue({ code: 'custom', message: `대기 시간 합계는 ${CUSTOM_COMMAND_MAX_TOTAL_DELAY_SECONDS}초를 넘길 수 없어요.` });
	}
});
export type CustomCommandSpecV2 = z.infer<typeof customCommandSpecSchemaV2>;
export type CustomCommandStep = z.infer<typeof customCommandStepSchema>;

export const customCommandSpecSchemaV1 = z
	.object({
		version: z.literal(1, '스펙 버전이 올바르지 않아요.'),
		steps: z
			.array(customCommandStepSchemaV1)
			.min(1, '스텝은 1개 이상이어야 해요.')
			.max(CUSTOM_COMMAND_MAX_STEPS, `스텝은 ${CUSTOM_COMMAND_MAX_STEPS}개 이하로 넣을 수 있어요.`)
	})
	.refine(
		(spec) =>
			spec.steps.filter((step) => step.type === 'delay').reduce((total, step) => total + step.seconds, 0) <=
			CUSTOM_COMMAND_MAX_TOTAL_DELAY_SECONDS,
		{ message: `대기 시간 합계는 ${CUSTOM_COMMAND_MAX_TOTAL_DELAY_SECONDS}초를 넘길 수 없어요.` }
	);

export const customCommandSpecSchema = z.union([customCommandSpecSchemaV1, customCommandSpecSchemaV2]);
export type CustomCommandSpec = z.infer<typeof customCommandSpecSchema>;

export const customCommandPayloadSchema = z
	.object({
		name: z
			.string()
			.min(1, '이름을 입력해 주세요.')
			.max(CUSTOM_COMMAND_NAME_MAX_LENGTH, `이름은 ${CUSTOM_COMMAND_NAME_MAX_LENGTH}자 이하로 입력해 주세요.`),
		description: z.string().max(100, '설명은 100자 이하여야 해요.').default(''),
		method: customCommandMethodSchema,
		spec: customCommandSpecSchemaV2
	})
	.superRefine((payload, ctx) => {
		const nameError = validateCustomCommandName(payload.name, payload.method);
		if (nameError) ctx.addIssue({ code: 'custom', path: ['name'], message: nameError });
		if (payload.method === 'slash' && payload.description.trim().length === 0) {
			ctx.addIssue({ code: 'custom', path: ['description'], message: '슬래시 명령어는 설명이 필요해요 (슬래시 목록에 보여요).' });
		}
	});
export type CustomCommandPayload = z.infer<typeof customCommandPayloadSchema>;

export const customCommandPatchSchema = z.object({
	name: z
		.string()
		.min(1, '이름을 입력해 주세요.')
		.max(CUSTOM_COMMAND_NAME_MAX_LENGTH, `이름은 ${CUSTOM_COMMAND_NAME_MAX_LENGTH}자 이하로 입력해 주세요.`)
		.optional(),
	description: z.string().max(100, '설명은 100자 이하여야 해요.').optional(),
	spec: customCommandSpecSchemaV2.optional()
});

export function normalizeCustomCommandName(name: string): string {
	return name.trim().toLowerCase();
}

export function validateCustomCommandName(name: string, method: CustomCommandMethod = 'prefix'): string | null {
	const trimmed = name.trim();
	if (trimmed.length === 0) return '이름을 입력해 주세요.';
	if (trimmed.length > CUSTOM_COMMAND_NAME_MAX_LENGTH) return `이름은 ${CUSTOM_COMMAND_NAME_MAX_LENGTH}자 이하로 입력해 주세요.`;
	if (!CUSTOM_COMMAND_NAME_PATTERN.test(trimmed)) return '이름에 공백을 넣을 수 없어요.';
	if (CUSTOM_COMMAND_RESERVED_NAMES.some((reserved) => reserved === normalizeCustomCommandName(trimmed))) {
		return `'${trimmed}'은(는) 예약된 이름이라 사용할 수 없어요.`;
	}
	if (method === 'slash') {
		if (!CUSTOM_COMMAND_SLASH_NAME_PATTERN.test(trimmed)) {
			return '슬래시 이름은 한글·영문 소문자·숫자·`-`·`_`만 사용할 수 있어요 (1~32자).';
		}
		if (/[A-Z]/u.test(trimmed)) return '슬래시 이름의 영문은 소문자만 사용할 수 있어요.';
	}
	return null;
}

export function validateCustomCommandPrefix(prefix: string): string | null {
	if (prefix.length === 0) return '접두사를 입력해 주세요.';
	if (prefix.length > CUSTOM_COMMAND_PREFIX_MAX_LENGTH) return `접두사는 ${CUSTOM_COMMAND_PREFIX_MAX_LENGTH}자 이하로 입력해 주세요.`;
	if (!CUSTOM_COMMAND_PREFIX_PATTERN.test(prefix)) return '접두사에 공백을 넣을 수 없어요.';
	return null;
}

export function normalizeCustomCommandPrefix(prefix: string | null | undefined): string {
	return typeof prefix === 'string' && validateCustomCommandPrefix(prefix) === null ? prefix : CUSTOM_COMMAND_PREFIX_DEFAULT;
}
