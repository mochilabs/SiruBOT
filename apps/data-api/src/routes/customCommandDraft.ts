/**
 * 커스텀 명령어 AI 초안 생성 — 대시보드 빌더의 자연어 설명을 JSON 스펙 초안으로 바꿔요.
 *
 * LLM 출력은 신뢰할 수 없으므로 (코드 펜스·잡담·형식 오류 포함) 항상 파싱+스키마 재검증을
 * 거쳐요. 형식이 맞지 않으면 사유를 담아 1회 재요청하고, 그래도 실패하면 사유를 돌려줘요
 * (HTTP 응답의 한국어 안내는 라우트가 만들어요).
 *
 * 모델 계약은 @sirubot/utils의 customCommandSpecSchema예요 — 스펙 v1이 바뀌면
 * DRAFT_SYSTEM_PROMPT의 규칙 설명도 함께 갱신해요.
 */
import { z } from 'zod';
import {
	CUSTOM_COMMAND_MAX_STEPS,
	CUSTOM_COMMAND_MAX_STEP_DELAY_SECONDS,
	CUSTOM_COMMAND_MAX_TOTAL_DELAY_SECONDS,
	CUSTOM_COMMAND_SPEC_VERSION,
	customCommandSpecSchema,
	normalizeCustomCommandName,
	validateCustomCommandName
} from '@sirubot/utils';

export const customCommandDraftRequestSchema = z.object({
	prompt: z.string().trim().min(1).max(500)
});

export interface CustomCommandDraft {
	name: string;
	description: string;
	spec: z.infer<typeof customCommandSpecSchema>;
}

export type CustomCommandDraftResult = { ok: true; draft: CustomCommandDraft } | { ok: false; reason: string };

const DRAFT_SYSTEM_PROMPT = [
	'당신은 디스코드 봇 시루(SiruBOT)의 "커스텀 명령어" 초안 생성기예요. 사용자의 설명을 받아 실행할 수 있는 JSON 스펙 초안을 만들어요.',
	'',
	'## 출력 형식',
	'반드시 아래 형태의 JSON 객체 하나만 출력해요. 인사·설명·코드 펜스를 붙이지 않아요.',
	'',
	'{"name":"명령어이름","description":"한 줄 설명","spec":{"version":1,"steps":[...]}}',
	'',
	'## 스펙 규칙 (v1)',
	`- steps는 1~${CUSTOM_COMMAND_MAX_STEPS}개의 배열이고, 스텝 종류는 두 가지만 있어요:`,
	`  - 메시지 전송: {"type":"send_message","text":"보낼 내용"} — text는 1~2000자`,
	`  - 대기: {"type":"delay","seconds":N} — N은 1~${CUSTOM_COMMAND_MAX_STEP_DELAY_SECONDS} 정수(초)`,
	`- 모든 대기 시간의 합은 ${CUSTOM_COMMAND_MAX_TOTAL_DELAY_SECONDS}초를 넘을 수 없어요.`,
	'- 실행 순서는 배열 순서예요. 사용자가 "잠시 후/몇 초 뒤"처럼 기다림을 말하면 delay를 넣어요.',
	`- "version"은 항상 ${CUSTOM_COMMAND_SPEC_VERSION}이에요.`,
	'',
	'## 이름·설명 규칙',
	`- name은 1~20자, 공백 없이 한 단어 (예: 아침브리핑, greet). '도움말'은 예약어라 사용할 수 없어요.`,
	'- description은 100자 이내 한 줄이에요. 설명이 비어 있으면 스텝 내용으로 요약해 만들어요.',
	'',
	'## 스텝 작성 팁',
	'- 메시지는 디스코드 마크다운만 써요. @everyone·@here 같은 멘션은 넣지 않아요 (실행 시 무시돼요).',
	'- 사용자가 여러 내용을 순서대로 말하면 메시지를 나눠 담아요.',
	'',
	'## 예시',
	'입력: 인사말 보내고 3초 뒤에 규칙 요약 알려줘',
	'출력: {"name":"인사규칙","description":"인사 후 3초 뒤 규칙 요약","spec":{"version":1,"steps":[{"type":"send_message","text":"안녕하세요! 규칙을 요약해 드릴게요."},{"type":"delay","seconds":3},{"type":"send_message","text":"- 채팅 규칙 요약..."}]}}'
].join('\n');

/** ```` 펜스로 감싸 온 출력을 벗겨요 */
function stripCodeFences(text: string): string {
	const lines = text.split('\n');
	while (lines.length > 0 && /^```/.test(lines[0]!.trim())) lines.shift();
	while (lines.length > 0 && /^```/.test(lines[lines.length - 1]!.trim())) lines.pop();
	return lines.join('\n').trim();
}

/** LLM 출력 → 검증된 초안. 실패하면 재요청에 쓸 한국어 사유를 돌려줘요. */
export function parseCustomCommandDraft(raw: string): CustomCommandDraftResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stripCodeFences(raw.trim()));
	} catch {
		return { ok: false, reason: 'JSON 객체가 아니에요' };
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, reason: 'JSON 객체가 아니에요' };
	const obj = parsed as { name?: unknown; description?: unknown; spec?: unknown };

	const name = typeof obj.name === 'string' ? normalizeCustomCommandName(obj.name) : '';
	const nameError = validateCustomCommandName(name);
	if (nameError) return { ok: false, reason: `name: ${nameError}` };

	const description = typeof obj.description === 'string' ? obj.description.trim().slice(0, 100) : '';

	const spec = customCommandSpecSchema.safeParse(obj.spec);
	if (!spec.success) {
		const first = spec.error.issues[0];
		return { ok: false, reason: `spec: ${first ? `${first.path.join('.')}: ${first.message}` : '스펙 형식이 올바르지 않아요'}` };
	}

	return { ok: true, draft: { name, description, spec: spec.data } };
}

/** LLM 1회 호출 + 형식 오류 시 1회 재요청. 실패하면 사유를 돌려줘요. */
export async function generateCustomCommandDraft(
	provider: { chatCompletion(systemPrompt: string, userContent: string, providerLabel: string): Promise<string> },
	prompt: string
): Promise<CustomCommandDraftResult> {
	let feedback = '';
	for (let attempt = 0; attempt < 2; attempt++) {
		let output: string;
		try {
			output = await provider.chatCompletion(
				DRAFT_SYSTEM_PROMPT,
				feedback ? `${prompt}\n\n${feedback}` : prompt,
				'custom command draft provider'
			);
		} catch (error) {
			return { ok: false, reason: `provider: ${error instanceof Error ? error.message : String(error)}` };
		}
		const parsed = parseCustomCommandDraft(output);
		if (parsed.ok) return parsed;
		feedback = `이전 출력이 형식에 맞지 않았어요 (${parsed.reason}). 설명을 다시 읽고 규칙에 맞는 JSON 객체 하나만 출력하세요.`;
	}
	return { ok: false, reason: 'output_format: 두 번 모두 형식에 맞지 않는 출력' };
}
