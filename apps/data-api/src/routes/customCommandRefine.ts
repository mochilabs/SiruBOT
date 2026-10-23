/**
 * 커스텀 명령어 AI 반복 수정 — 대시보드 빌더의 "수정 지시"를 현재 스펙에 반영한 새 스펙으로 바꿔요.
 *
 * - AI 코딩툴처럼 대화를 이어가요: 최근 N턴(최대 16개 메시지)의 지시·응답 히스토리와 현재 스펙을
 *   함께 보내요. 히스토리는 대시보드 세션이 들고 있어요 (DB 저장 안 함).
 * - 출력은 "지시된 부분만 바꾼 전체 스펙" 하나예요. 초안과 같은 검증 루프(파싱+스키마 재검증,
 *   형식 오류 시 1회 재요청)를 써요 — LLM 출력은 항상 신뢰하지 않아요.
 * - 스펙만 수정해요 (이름·설명·실행 방식은 그대로) — 실행 방식 변경은 재생성 전용이에요.
 */
import { z } from 'zod';
import { customCommandSpecSchemaV2, type CustomCommandSpecV2 } from '@sirubot/utils';

import { CUSTOM_COMMAND_SPEC_RULES, generateValidated, stripCodeFences, type DraftProvider } from './customCommandDraft.ts';

/** 최근 대화 기억 한도 — 대시보드 세션이 넘기기 전에 여기서 한 번 더 잘라요 */
export const CUSTOM_COMMAND_REFINE_MAX_HISTORY = 16;

export const customCommandRefineRequestSchema = z.object({
	prompt: z.string().trim().min(1, '수정 지시를 입력해 주세요.').max(500),
	currentSpec: customCommandSpecSchemaV2,
	history: z
		.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(1000) }))
		.max(CUSTOM_COMMAND_REFINE_MAX_HISTORY, `대화 기억은 ${CUSTOM_COMMAND_REFINE_MAX_HISTORY}개까지 보낼 수 있어요.`)
		.default([])
});
export type CustomCommandRefineRequest = z.infer<typeof customCommandRefineRequestSchema>;

export type CustomCommandRefineResult = { ok: true; spec: CustomCommandSpecV2 } | { ok: false; reason: string };

const REFINE_SYSTEM_PROMPT = [
	'당신은 디스코드 봇 시루(SiruBOT)의 "커스텀 명령어" 편집기예요. 현재 스펙 JSON과 사용자의 수정 지시를 받아, 지시된 부분만 바꾼 **전체 스펙 JSON**을 만들어요.',
	'',
	'## 출력 형식',
	'반드시 스펙 객체 하나만 출력해요. 인사·설명·코드 펜스를 붙이지 않아요.',
	'',
	'{"version":2,"steps":[...]}',
	'',
	'## 편집 규칙',
	'- 지시한 부분만 바꾸고, 나머지 스텝·access 값은 그대로 유지해요.',
	'- 이름·설명·실행 방식은 출력하지 않아요 — 스펙만 출력해요.',
	'- 지시가 모호하면 추측해서 크게 바꾸지 말고, 가장 가까운 해석으로 최소한만 수정해요.',
	'- 최근 대화(이전 지시와 응답)를 참고해 맥락을 이어가요.',
	'',
	CUSTOM_COMMAND_SPEC_RULES
].join('\n');

/** LLM 출력 → 검증된 스펙. 실패하면 재요청에 쓸 한국어 사유를 돌려줘요. */
export function parseCustomCommandRefine(raw: string): CustomCommandRefineResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stripCodeFences(raw.trim()));
	} catch {
		return { ok: false, reason: 'JSON 객체가 아니에요' };
	}
	const spec = customCommandSpecSchemaV2.safeParse(parsed);
	if (!spec.success) {
		const first = spec.error.issues[0];
		return { ok: false, reason: first ? `spec: ${first.path.join('.')}: ${first.message}` : '스펙 형식이 올바르지 않아요' };
	}
	return { ok: true, spec: spec.data };
}

/** 지시문 + 히스토리 + 현재 스펙 → 수정된 스펙. 형식 오류 시 1회 재요청해요. */
export async function generateCustomCommandRefine(provider: DraftProvider, request: CustomCommandRefineRequest): Promise<CustomCommandRefineResult> {
	const historyText = request.history.map((turn) => `${turn.role === 'user' ? '사용자 지시' : '이전 응답'}: ${turn.content}`).join('\n');
	const userContent = [
		historyText ? `## 최근 대화\n${historyText}` : '',
		`## 현재 스펙\n${JSON.stringify(request.currentSpec)}`,
		`## 수정 지시\n${request.prompt}`
	]
		.filter(Boolean)
		.join('\n\n');

	const generated = await generateValidated(
		provider,
		REFINE_SYSTEM_PROMPT,
		userContent,
		(raw) => {
			const parsed = parseCustomCommandRefine(raw);
			return parsed.ok ? { ok: true, value: parsed.spec } : parsed;
		},
		'custom command refine provider'
	);
	return generated.ok ? { ok: true, spec: generated.value } : generated;
}
