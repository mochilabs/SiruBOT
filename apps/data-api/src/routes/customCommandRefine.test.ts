import { describe, expect, it } from 'vitest';
import { customCommandRefineRequestSchema, generateCustomCommandRefine, parseCustomCommandRefine } from './customCommandRefine.ts';

const CURRENT_SPEC = {
	version: 2,
	steps: [
		{ type: 'send_message', text: '첫째' },
		{ type: 'send_message', text: '둘째' }
	]
};
const VALID_REFINE_OUTPUT = JSON.stringify({
	version: 2,
	steps: [
		{ type: 'send_message', text: '첫째' },
		{ type: 'send_message', text: '짧아진 둘째' }
	]
});

describe('customCommandRefineRequestSchema', () => {
	it('accepts a spec with history and rejects oversized history/prompt', () => {
		expect(customCommandRefineRequestSchema.safeParse({ prompt: '둘째 메시지를 짧게', currentSpec: CURRENT_SPEC }).success).toBe(true);
		expect(customCommandRefineRequestSchema.safeParse({ prompt: 'a'.repeat(501), currentSpec: CURRENT_SPEC }).success).toBe(false);
		const longHistory = Array.from({ length: 17 }, () => ({ role: 'user', content: 'x' }));
		expect(customCommandRefineRequestSchema.safeParse({ prompt: '수정', currentSpec: CURRENT_SPEC, history: longHistory }).success).toBe(false);
	});

	it('rejects v1 current specs (반복 수정은 저장 계약인 v2만)', () => {
		expect(
			customCommandRefineRequestSchema.safeParse({ prompt: '수정', currentSpec: { version: 1, steps: [{ type: 'send_message', text: 'x' }] } })
				.success
		).toBe(false);
	});
});

describe('parseCustomCommandRefine', () => {
	it('parses a valid spec output (fences allowed)', () => {
		const result = parseCustomCommandRefine(`\`\`\`json\n${VALID_REFINE_OUTPUT}\n\`\`\``);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.spec.steps).toHaveLength(2);
	});

	it('rejects non-JSON and invalid specs with Korean reasons', () => {
		expect(parseCustomCommandRefine('여기 수정했어요!')).toMatchObject({ ok: false });
		const bad = parseCustomCommandRefine(JSON.stringify({ version: 2, steps: [] }));
		expect(bad.ok).toBe(false);
		if (!bad.ok) expect(bad.reason).toContain('spec');
	});
});

describe('generateCustomCommandRefine', () => {
	const request = { prompt: '둘째를 짧게', currentSpec: CURRENT_SPEC as never, history: [] };

	it('returns the first valid output and sends the current spec to the model', async () => {
		let userContent = '';
		const provider = {
			async chatCompletion(_system: string, content: string) {
				userContent = content;
				return VALID_REFINE_OUTPUT;
			}
		};
		const result = await generateCustomCommandRefine(provider, request);
		expect(result.ok).toBe(true);
		expect(userContent).toContain('둘째');
		expect(userContent).toContain('수정 지시');
	});

	it('includes recent turns in the prompt and retries once on bad output', async () => {
		let calls = 0;
		let userContent = '';
		const provider = {
			async chatCompletion(_system: string, content: string) {
				calls++;
				userContent = content;
				return calls === 1 ? '이건 JSON이 아니에요' : VALID_REFINE_OUTPUT;
			}
		};
		const result = await generateCustomCommandRefine(provider, {
			...request,
			history: [
				{ role: 'user', content: '맨 뒤에 리액트 추가해줘' },
				{ role: 'assistant', content: '리액트 스텝을 추가했어요' }
			]
		});
		expect(result.ok).toBe(true);
		expect(calls).toBe(2);
		expect(userContent).toContain('맨 뒤에 리액트 추가해줘');
	});
});
