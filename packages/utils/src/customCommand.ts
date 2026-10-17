/**
 * 커스텀 명령어 — 접두사/슬래시 명령어의 공용 계약 (봇·대시보드·data-api가 함께 써요).
 *
 * 길드 관리자가 대시보드에서 JSON 스텝 체인을 조립(또는 AI 초안 생성)해 저장하면,
 * 실행 방식(method)에 따라 봇이 "접두사 + 이름" 메시지 또는 슬래시 인터랙션으로 스텝을
 * 순차 실행해요. 디스코드 슬래시 등록은 method='slash'인 명령어만 길드 커맨드로 개별 등록돼요.
 *
 * 스펙 버전(version)을 올릴 때는 이 파일의 스키마만 확장하고, 봇 인터프리터와
 * 대시보드 빌더·data-api 생성 프롬프트를 함께 갱신해요.
 * - v1(2026-10): send_message(텍스트)·delay
 * - v2(2026-10): 실행 제한(access)·역할 부여/제거·리액트·고정·지연 삭제·if·인수 치환·CV2 디자인
 */
import { z } from 'zod';

/** 스펙 버전 — 저장되는 신규 스펙의 버전이에요. v1은 런타임 호환만 유지해요 */
export const CUSTOM_COMMAND_SPEC_VERSION = 2;

/** 한 명령어의 최대 스텝 수 (if 서브 스텝 포함) */
export const CUSTOM_COMMAND_MAX_STEPS = 20;
/** 스텝 1개의 최대 대기(초) */
export const CUSTOM_COMMAND_MAX_STEP_DELAY_SECONDS = 300;
/** 한 실행의 총 대기 상한(초) — 스텝 수 × 스텝 대기로 실행 시간이 폭발하는 걸 막아요 (if 서브 스텝의 대기 포함) */
export const CUSTOM_COMMAND_MAX_TOTAL_DELAY_SECONDS = 600;
/** 길드당 커스텀 명령어 최대 개수 */
export const CUSTOM_COMMAND_MAX_PER_GUILD = 20;
/** 길드당 슬래시형 커스텀 명령어 최대 개수 — 봇 본 커맨드의 Discord 슬롯을 보호해요 */
export const CUSTOM_COMMAND_MAX_SLASH_PER_GUILD = 20;
/** 인수 치환 한도 — {argv0}~{argv4} */
export const CUSTOM_COMMAND_MAX_ARGS = 5;
/** if 서브 스텝(then/else) 각각의 최대 스텝 수 */
export const CUSTOM_COMMAND_IF_MAX_SUB_STEPS = 10;

/** 이름: 접두사 뒤 첫 토큰으로만 매칭돼요 — 공백 없이 1~20자 */
export const CUSTOM_COMMAND_NAME_MAX_LENGTH = 20;
export const CUSTOM_COMMAND_NAME_PATTERN = /^\S+$/u;
/** 슬래시형 이름 — Discord 애플리케이션 커맨드 패턴 (^[-_\p{L}\p{N}]{1,32}$). 라틴 대문자는 validate가 별도로 막아요 */
export const CUSTOM_COMMAND_SLASH_NAME_PATTERN = /^[-_\p{L}\p{N}]{1,32}$/u;

/** 기능성 예약 키워드 — 목록 응답(!도움말) 등에 쓰이므로 사용자 이름으로 등록 불가 */
export const CUSTOM_COMMAND_RESERVED_NAMES = ['도움말'] as const;

/** 접두사 기본값·규칙 — 1~3자, 공백 불가 */
export const CUSTOM_COMMAND_PREFIX_DEFAULT = '!';
export const CUSTOM_COMMAND_PREFIX_MAX_LENGTH = 3;
export const CUSTOM_COMMAND_PREFIX_PATTERN = /^\S+$/;

const snowflakeSchema = z.string().regex(/^\d{17,20}$/, '올바른 대상을 선택해 주세요.');
const httpsUrlSchema = z
	.string()
	.url('이미지 주소가 올바르지 않아요.')
	.regex(/^https:\/\//u, 'https 주소만 사용할 수 있어요.');

// --- 실행 방식 (method) — DB 컬럼과 같은 값이에요. 생성 시점에 정해지고 바뀌지 않아요 ---

export const customCommandMethodSchema = z.enum(['prefix', 'slash']);
export type CustomCommandMethod = z.infer<typeof customCommandMethodSchema>;

// --- 실행 제한 (access) — 누가 이 명령어를 실행할 수 있는지 ---

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

// --- CV2 디자인 — send_message의 design 필드. items는 컨테이너 안에 순서대로 쌓여요 ---

export const CUSTOM_COMMAND_ACCENT_COLORS = ['blue', 'green', 'red', 'purple', 'gray'] as const;
export type CustomCommandAccentColor = (typeof CUSTOM_COMMAND_ACCENT_COLORS)[number];

/** 강조색 팔레트의 실제 색값 — 봇 전송과 대시보드 프리뷰가 같은 색을 보여줘요 */
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

// --- 스텝 스키마 ---

const sendMessageStepSchema = z.object({
	type: z.literal('send_message'),
	// text·design 최소 1개 필수는 스펙 superRefine에서 검사해요 (discriminatedUnion 멤버는 순수 object 유지)
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

/** if 조건 — 전부 실행자·실행 맥락 기준이에요 (타인 대상 조작은 악용 방지를 위해 없어요) */
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

/** if 안에 들어갈 수 있는 스텝 — 중첩 if는 허용하지 않아요 */
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

/** v2 스텝 — 새 액션은 여기에 스키마를 하나 더 붙여요. 메시지는 한국어로 — 대시보드가 그대로 사용자에게 보여줘요. */
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

/** v1 스텝 — 런타임 호환용으로 보존해요 */
const sendMessageStepSchemaV1 = z.object({
	type: z.literal('send_message'),
	text: z.string().min(1, '메시지를 입력해 주세요.').max(2000, '메시지는 2000자 이하여야 해요.')
});
export const customCommandStepSchemaV1 = z.discriminatedUnion('type', [sendMessageStepSchemaV1, delayStepSchema]);

// --- 스펙 전체 검증 ---

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
	// send_message는 text·design 최소 1개
	walkSteps(spec.steps, (step) => {
		if (step.type === 'send_message' && step.text === undefined && step.design === undefined) {
			ctx.addIssue({ code: 'custom', message: '보낼 내용(텍스트 또는 디자인)을 입력해 주세요.' });
		}
	});
	// 역할 변경 액션은 실행 제한 필수 — 아무나 실행하면 역할 탈취 수단이 돼요.
	// if 분기(then/else) 안의 역할 액션도 놓치지 않도록 walkSteps로 재귀 순회해요 (최상위 검사만 하면 우회돼요).
	let hasRoleAction = false;
	walkSteps(spec.steps, (step) => {
		if (step.type === 'add_role' || step.type === 'remove_role') hasRoleAction = true;
	});
	if (hasRoleAction && (spec.access === undefined || spec.access.mode === 'everyone')) {
		ctx.addIssue({ code: 'custom', message: '역할 변경 액션은 실행 제한(역할/권한)이 필요해요.' });
	}
	// 대기 합계 — if 서브 스텝 포함
	if (totalDelaySeconds(spec.steps) > CUSTOM_COMMAND_MAX_TOTAL_DELAY_SECONDS) {
		ctx.addIssue({ code: 'custom', message: `대기 시간 합계는 ${CUSTOM_COMMAND_MAX_TOTAL_DELAY_SECONDS}초를 넘길 수 없어요.` });
	}
});
export type CustomCommandSpecV2 = z.infer<typeof customCommandSpecSchemaV2>;
export type CustomCommandStep = z.infer<typeof customCommandStepSchema>;
export type CustomCommandStepV1 = z.infer<typeof customCommandStepSchemaV1>;

/** v1 스펙 — 저장된 옛 스펙 실행용으로만 써요 */
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
export type CustomCommandSpecV1 = z.infer<typeof customCommandSpecSchemaV1>;

/** 저장된 spec(JSON)은 신뢰할 수 없는 입력이에요 — 실행 전에 반드시 이 스키마로 재검증해요. v1·v2 모두 허용 */
export const customCommandSpecSchema = z.union([customCommandSpecSchemaV1, customCommandSpecSchemaV2]);
export type CustomCommandSpec = z.infer<typeof customCommandSpecSchema>;

/** 대시보드 편집기/AI 초안이 주고받는 한 명령어의 페이로드 — 저장은 항상 v2 스펙이에요 */
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

/**
 * 수정(PATCH)용 부분 스펙 — 이름/실행 방식 검증은 대상 명령어의 method에 의존하므로
 * 라우트가 별도로 검사해요. (zod 4는 refine 있는 스키마에 .partial()을 못 써요)
 */
export const customCommandPatchSchema = z.object({
	name: z
		.string()
		.min(1, '이름을 입력해 주세요.')
		.max(CUSTOM_COMMAND_NAME_MAX_LENGTH, `이름은 ${CUSTOM_COMMAND_NAME_MAX_LENGTH}자 이하로 입력해 주세요.`)
		.optional(),
	description: z.string().max(100, '설명은 100자 이하여야 해요.').optional(),
	spec: customCommandSpecSchemaV2.optional()
});
export type CustomCommandPatch = z.infer<typeof customCommandPatchSchema>;

/** 이름 비교용 정규화 — 'Greet'와 'greet'를 같은 명령어로 봐요 */
export function normalizeCustomCommandName(name: string): string {
	return name.trim().toLowerCase();
}

/** 생성/수정 시 이름 검증 — 통과하면 null, 실패하면 한국어 사유. 슬래시형은 Discord 패턴을 추가로 검사해요 */
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

/** 접두사 검증 — 통과하면 null, 실패하면 한국어 사유 */
export function validateCustomCommandPrefix(prefix: string): string | null {
	if (prefix.length === 0) return '접두사를 입력해 주세요.';
	if (prefix.length > CUSTOM_COMMAND_PREFIX_MAX_LENGTH) return `접두사는 ${CUSTOM_COMMAND_PREFIX_MAX_LENGTH}자 이하로 입력해 주세요.`;
	if (!CUSTOM_COMMAND_PREFIX_PATTERN.test(prefix)) return '접두사에 공백을 넣을 수 없어요.';
	return null;
}

/** DB에 옛/깨진 값이 들어있어도 안전한 접두사로 되돌려요 */
export function normalizeCustomCommandPrefix(prefix: string | null | undefined): string {
	return typeof prefix === 'string' && validateCustomCommandPrefix(prefix) === null ? prefix : CUSTOM_COMMAND_PREFIX_DEFAULT;
}
