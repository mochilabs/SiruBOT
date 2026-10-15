/**
 * 커스텀 명령어 — 접두사 메시지 명령어의 공용 계약 (봇·대시보드·data-api가 함께 써요).
 *
 * 길드 관리자가 대시보드에서 JSON 스텝 체인을 조립(또는 AI 초안 생성)해 저장하면,
 * 봇의 접두사 리스너가 "접두사 + 이름" 형태의 메시지를 받아 스텝을 순차 실행해요.
 * 디스코드 슬래시 등록을 거치지 않아 이름 수·등록 지연 제한이 없어요.
 *
 * 스펙 버전(version)을 올릴 때는 이 파일의 스키마만 확장하고, 봇 인터프리터와
 * 대시보드 빌더·data-api 생성 프롬프트를 함께 갱신해요.
 */
import { z } from 'zod';

/** 스펙 버전 — v2에서 스텝 종류를 늘릴 때 올려요 */
export const CUSTOM_COMMAND_SPEC_VERSION = 1;

/** 한 명령어의 최대 스텝 수 */
export const CUSTOM_COMMAND_MAX_STEPS = 20;
/** 스텝 1개의 최대 대기(초) */
export const CUSTOM_COMMAND_MAX_STEP_DELAY_SECONDS = 300;
/** 한 실행의 총 대기 상한(초) — 스텝 수 × 스텝 대기로 실행 시간이 폭발하는 걸 막아요 */
export const CUSTOM_COMMAND_MAX_TOTAL_DELAY_SECONDS = 600;
/** 길드당 커스텀 명령어 최대 개수 */
export const CUSTOM_COMMAND_MAX_PER_GUILD = 20;

/** 이름: 접두사 뒤 첫 토큰으로만 매칭돼요 — 공백 없이 1~20자 */
export const CUSTOM_COMMAND_NAME_MAX_LENGTH = 20;
export const CUSTOM_COMMAND_NAME_PATTERN = /^\S+$/u;

/** 기능성 예약 키워드 — 목록 응답(!도움말) 등에 쓰이므로 사용자 이름으로 등록 불가 */
export const CUSTOM_COMMAND_RESERVED_NAMES = ['도움말'] as const;

/** 접두사 기본값·규칙 — 1~3자, 공백 불가 */
export const CUSTOM_COMMAND_PREFIX_DEFAULT = '!';
export const CUSTOM_COMMAND_PREFIX_MAX_LENGTH = 3;
export const CUSTOM_COMMAND_PREFIX_PATTERN = /^\S+$/;

const sendMessageStepSchema = z.object({
	type: z.literal('send_message'),
	text: z.string().min(1, '메시지를 입력해 주세요.').max(2000, '메시지는 2000자 이하여야 해요.')
});

const delayStepSchema = z.object({
	type: z.literal('delay'),
	seconds: z
		.number()
		.int('대기 시간은 정수(초)여야 해요.')
		.min(1, '대기 시간은 1초 이상이에요.')
		.max(CUSTOM_COMMAND_MAX_STEP_DELAY_SECONDS, `대기 시간은 ${CUSTOM_COMMAND_MAX_STEP_DELAY_SECONDS}초 이하여야 해요.`)
});

/** v1 스텝 — 새 액션은 여기에 스키마를 하나 더 붙여요. 메시지는 한국어로 — 대시보드가 그대로 사용자에게 보여줘요. */
export const customCommandStepSchema = z.discriminatedUnion('type', [sendMessageStepSchema, delayStepSchema]);

/** 저장된 spec(JSON)은 신뢰할 수 없는 입력이에요 — 실행 전에 반드시 이 스키마로 재검증해요 */
export const customCommandSpecSchema = z
	.object({
		version: z.literal(CUSTOM_COMMAND_SPEC_VERSION, '스펙 버전이 올바르지 않아요.'),
		steps: z
			.array(customCommandStepSchema)
			.min(1, '스텝은 1개 이상이어야 해요.')
			.max(CUSTOM_COMMAND_MAX_STEPS, `스텝은 ${CUSTOM_COMMAND_MAX_STEPS}개 이하로 넣을 수 있어요.`)
	})
	.refine(
		(spec) =>
			spec.steps.filter((step) => step.type === 'delay').reduce((total, step) => total + step.seconds, 0) <=
			CUSTOM_COMMAND_MAX_TOTAL_DELAY_SECONDS,
		{ message: `대기 시간 합계는 ${CUSTOM_COMMAND_MAX_TOTAL_DELAY_SECONDS}초를 넘길 수 없어요.` }
	);

export type CustomCommandStep = z.infer<typeof customCommandStepSchema>;
export type CustomCommandSpec = z.infer<typeof customCommandSpecSchema>;

/** 대시보드 편집기/AI 초안이 주고받는 한 명령어의 페이로드 */
export const customCommandPayloadSchema = z.object({
	name: z
		.string()
		.min(1, '이름을 입력해 주세요.')
		.max(CUSTOM_COMMAND_NAME_MAX_LENGTH, `이름은 ${CUSTOM_COMMAND_NAME_MAX_LENGTH}자 이하로 입력해 주세요.`),
	description: z.string().max(100, '설명은 100자 이하여야 해요.').default(''),
	spec: customCommandSpecSchema
});
export type CustomCommandPayload = z.infer<typeof customCommandPayloadSchema>;

/** 이름 비교용 정규화 — 'Greet'와 'greet'를 같은 명령어로 봐요 */
export function normalizeCustomCommandName(name: string): string {
	return name.trim().toLowerCase();
}

/** 생성/수정 시 이름 검증 — 통과하면 null, 실패하면 한국어 사유 */
export function validateCustomCommandName(name: string): string | null {
	const trimmed = name.trim();
	if (trimmed.length === 0) return '이름을 입력해 주세요.';
	if (trimmed.length > CUSTOM_COMMAND_NAME_MAX_LENGTH) return `이름은 ${CUSTOM_COMMAND_NAME_MAX_LENGTH}자 이하로 입력해 주세요.`;
	if (!CUSTOM_COMMAND_NAME_PATTERN.test(trimmed)) return '이름에 공백을 넣을 수 없어요.';
	if (CUSTOM_COMMAND_RESERVED_NAMES.some((reserved) => reserved === normalizeCustomCommandName(trimmed))) {
		return `'${trimmed}'은(는) 예약된 이름이라 사용할 수 없어요.`;
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

/** DB에 옛/깨린 값이 들어있어도 안전한 접두사로 되돌려요 */
export function normalizeCustomCommandPrefix(prefix: string | null | undefined): string {
	return typeof prefix === 'string' && validateCustomCommandPrefix(prefix) === null ? prefix : CUSTOM_COMMAND_PREFIX_DEFAULT;
}
