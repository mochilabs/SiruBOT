/**
 * 커스텀 명령어 AI 초안 생성. 대시보드 빌더의 자연어 설명을 JSON 스펙 초안으로 바꿔요.
 * LLM 출력은 파싱+스키마 재검증을 거치고, 형식 오류는 사유를 담아 1회 재요청해요(HTTP 안내는 라우트 소유).
 * 모델 계약은 @sirubot/utils의 customCommandPayloadSchema(스펙 v2)예요. 스펙이 바뀌면 CUSTOM_COMMAND_SPEC_RULES도 함께 갱신하고, 반복 수정도 같은 규칙 상수를 써요.
 */
import { z } from 'zod';
import {
	CUSTOM_COMMAND_MAX_ARGS,
	CUSTOM_COMMAND_MAX_STEPS,
	CUSTOM_COMMAND_MAX_STEP_DELAY_SECONDS,
	CUSTOM_COMMAND_MAX_TOTAL_DELAY_SECONDS,
	CUSTOM_COMMAND_SPEC_VERSION,
	customCommandPayloadSchema,
	normalizeCustomCommandName,
	type CustomCommandPayload
} from '@sirubot/utils';

export const customCommandDraftRequestSchema = z.object({
	prompt: z.string().trim().min(1).max(500)
});

export type CustomCommandDraft = CustomCommandPayload;

/** 스펙 규칙 공용 텍스트 — 초안과 반복 수정 프롬프트가 함께 써요 (DRY) */
export const CUSTOM_COMMAND_SPEC_RULES = [
	'## 스펙 규칙 (v2)',
	`- "version"은 항상 ${CUSTOM_COMMAND_SPEC_VERSION}이에요.`,
	`- steps는 1~${CUSTOM_COMMAND_MAX_STEPS}개의 배열이고, 실행은 배열 순서예요.`,
	'- 스텝 종류:',
	'  - 메시지 전송: {"type":"send_message","text":"보낼 내용"} — text는 1~2000자. 간단한 안내는 이걸 써요.',
	'  - 디자인 메시지: {"type":"send_message","design":{"accentColor":"blue|green|red|purple|gray","items":[...]}} — items 종류: {"kind":"text","content":"..."} · {"kind":"separator"} · {"kind":"section","content":"...","thumbnailUrl":"https://..."} · {"kind":"media","urls":["https://..."]} (items는 1~10개, 이미지는 https URL만)',
	`  - 대기: {"type":"delay","seconds":N} — N은 1~${CUSTOM_COMMAND_MAX_STEP_DELAY_SECONDS} 정수(초). 모든 대기의 합은 ${CUSTOM_COMMAND_MAX_TOTAL_DELAY_SECONDS}초 이하`,
	'  - 역할 부여/제거: {"type":"add_role","roleId":"<역할 ID>"} / {"type":"remove_role","roleId":"<역할 ID>"} — roleId는 사용자가 알려준 역할 ID만 써요. ID를 모르면 스텝을 넣지 말고 어떤 역할인지 되물어보세요.',
	'  - 반응 추가: {"type":"add_reaction","emoji":"🎉"} — 실행을 유발한 메시지에 리액트',
	'  - 메시지 고정: {"type":"pin_message"}',
	'  - 트리거 삭제: {"type":"delete_trigger","afterSeconds":N} — N은 1~60 정수(초)',
	'  - 조건부: {"type":"if","condition":{...},"then":[스텝...],"else":[스텝...]} — then은 1~10개, else는 선택, if 안에 if는 넣을 수 없어요',
	'    조건 종류: {"kind":"has_role","roleId":"..."}(실행자 역할 보유) · {"kind":"channel_match","channelId":"..."}(채널 일치) · {"kind":"arg_matches","index":0,"value":"..."}(인수 값 일치)',
	`- 인수 치환: 텍스트에 {argv0}~{argv${CUSTOM_COMMAND_MAX_ARGS - 1}}를 쓰면 실행자가 입력한 인수로 바뀌어요.`,
	'- access(실행 제한): 역할 변경(add_role/remove_role) 스텝이 하나라도 있으면 필수예요 — {"mode":"roles","roleIds":["<역할 ID>"]} 또는 {"mode":"permissions","permissions":["ManageRoles|ManageChannels|ManageMessages|Administrator"]}',
	'- 디스코드 마크다운만 써요. @everyone·@here 같은 멘션은 넣지 않아요 (실행 시 무시돼요).'
].join('\n');

const DRAFT_SYSTEM_PROMPT = [
	'당신은 디스코드 봇 시루(SiruBOT)의 "커스텀 명령어" 초안 생성기예요. 사용자의 설명을 받아 실행할 수 있는 JSON 초안을 만들어요.',
	'',
	'## 출력 형식',
	'반드시 아래 형태의 JSON 객체 하나만 출력해요. 인사·설명·코드 펜스를 붙이지 않아요.',
	'',
	'{"name":"명령어이름","description":"한 줄 설명","method":"prefix","spec":{"version":2,"steps":[...]}}',
	'',
	CUSTOM_COMMAND_SPEC_RULES,
	'',
	'## 실행 방식 (method)',
	'- 사용자가 "슬래시로 등록/슬래시 명령어로 만들어줘"라고 하면 "method":"slash", 아니면 "prefix"예요.',
	'- slash면 설명은 반드시 채워요 (슬래시 목록에 보여요). 이름은 한글·영문 소문자·숫자·`-`·`_`만 사용해요.',
	'',
	'## 이름·설명 규칙',
	`- name은 1~20자, 공백 없이 한 단어 (예: 아침브리핑, greet). '도움말'은 예약어라 사용할 수 없어요.`,
	'- description은 100자 이내 한 줄이에요. 설명이 비어 있으면 스텝 내용으로 요약해 만들어요.',
	'',
	'## 스텝 작성 팁',
	'- 사용자가 여러 내용을 순서대로 말하면 스텝으로 나눠 담아요. "잠시 후/몇 초 뒤"처럼 기다림을 말하면 delay를 넣어요.',
	'- 공지·안내처럼 꾸미고 싶은 메시지는 design으로 만들고, 짧은 응답은 text로 남겨요.',
	'',
	'## 예시',
	'입력: 인사말 보내고 3초 뒤에 규칙 요약 알려줘',
	'출력: {"name":"인사규칙","description":"인사 후 3초 뒤 규칙 요약","method":"prefix","spec":{"version":2,"steps":[{"type":"send_message","text":"안녕하세요! 규칙을 요약해 드릴게요."},{"type":"delay","seconds":3},{"type":"send_message","text":"- 채팅 규칙 요약..."}]}}'
].join('\n');

/** ```` 펜스로 감싸 온 출력을 벗겨요 */
export function stripCodeFences(text: string): string {
	const lines = text.split('\n');
	while (lines.length > 0 && /^```/.test(lines[0]!.trim())) lines.shift();
	while (lines.length > 0 && /^```/.test(lines[lines.length - 1]!.trim())) lines.pop();
	return lines.join('\n').trim();
}

export interface DraftProvider {
	chatCompletion(systemPrompt: string, userContent: string, providerLabel: string): Promise<string>;
}

/**
 * LLM 1회 호출 + 형식 오류 시 1회 재요청 공용 루프 — 초안/반복 수정이 함께 써요.
 * parse가 실패 사유를 돌려주면 그 사유로 재요청해요.
 */
export async function generateValidated<T>(
	provider: DraftProvider,
	systemPrompt: string,
	userContent: string,
	parse: (raw: string) => { ok: true; value: T } | { ok: false; reason: string },
	providerLabel: string
): Promise<{ ok: true; value: T } | { ok: false; reason: string }> {
	let feedback = '';
	for (let attempt = 0; attempt < 2; attempt++) {
		let output: string;
		try {
			output = await provider.chatCompletion(systemPrompt, feedback ? `${userContent}\n\n${feedback}` : userContent, providerLabel);
		} catch (error) {
			return { ok: false, reason: `provider: ${error instanceof Error ? error.message : String(error)}` };
		}
		const parsed = parse(output);
		if (parsed.ok) return parsed;
		feedback = `이전 출력이 형식에 맞지 않았어요 (${parsed.reason}). 설명을 다시 읽고 규칙에 맞는 JSON 객체 하나만 출력하세요.`;
	}
	return { ok: false, reason: 'output_format: 두 번 모두 형식에 맞지 않는 출력' };
}

/** LLM 출력 → 검증된 초안. 실패하면 재요청에 쓸 한국어 사유를 돌려줘요. */
export function parseCustomCommandDraft(raw: string): { ok: true; draft: CustomCommandDraft } | { ok: false; reason: string } {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stripCodeFences(raw.trim()));
	} catch {
		return { ok: false, reason: 'JSON 객체가 아니에요' };
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, reason: 'JSON 객체가 아니에요' };
	const obj = parsed as { name?: unknown; description?: unknown; method?: unknown; spec?: unknown };

	const draft = customCommandPayloadSchema.safeParse({
		name: typeof obj.name === 'string' ? normalizeCustomCommandName(obj.name) : '',
		description: typeof obj.description === 'string' ? obj.description : '',
		method: obj.method === 'slash' ? 'slash' : 'prefix',
		spec: obj.spec
	});
	if (!draft.success) {
		const first = draft.error.issues[0];
		return { ok: false, reason: first ? `${first.path.join('.') || 'payload'}: ${first.message}` : '초안 형식이 올바르지 않아요' };
	}
	return { ok: true, draft: draft.data };
}

/** LLM 1회 호출 + 형식 오류 시 1회 재요청. 실패하면 사유를 돌려줘요. */
export async function generateCustomCommandDraft(
	provider: DraftProvider,
	prompt: string
): Promise<{ ok: true; draft: CustomCommandDraft } | { ok: false; reason: string }> {
	const generated = await generateValidated(
		provider,
		DRAFT_SYSTEM_PROMPT,
		prompt,
		(raw) => {
			const parsed = parseCustomCommandDraft(raw);
			return parsed.ok ? { ok: true, value: parsed.draft } : parsed;
		},
		'custom command draft provider'
	);
	return generated.ok ? { ok: true, draft: generated.value } : generated;
}
