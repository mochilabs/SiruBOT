import { describe, expect, it } from 'vitest';
import { generateCustomCommandDraft, parseCustomCommandDraft } from './customCommandDraft.ts';

const VALID_OUTPUT = JSON.stringify({
	name: '아침브리핑',
	description: '인사와 규칙 요약',
	spec: {
		version: 1,
		steps: [
			{ type: 'send_message', text: '좋은 아침!' },
			{ type: 'delay', seconds: 3 },
			{ type: 'send_message', text: '규칙 요약...' }
		]
	}
});

describe('parseCustomCommandDraft', () => {
	it('parses a valid payload and normalizes the name', () => {
		const result = parseCustomCommandDraft(`\`\`\`json\n${VALID_OUTPUT}\n\`\`\``);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.draft.name).toBe('아침브리핑');
			expect(result.draft.spec.steps).toHaveLength(3);
		}
	});

	it('rejects non-JSON, reserved names, bad specs with Korean reasons', () => {
		expect(parseCustomCommandDraft('안녕하세요! 초안을 만들었어요: ...')).toMatchObject({ ok: false });
		expect(parseCustomCommandDraft(JSON.stringify({ name: '도움말', description: '', spec: VALID_OUTPUT_SPEC() }))).toMatchObject({ ok: false });
		const badSpec = parseCustomCommandDraft(JSON.stringify({ name: 'greet', description: '', spec: { version: 1, steps: [] } }));
		expect(badSpec.ok).toBe(false);
		if (!badSpec.ok) expect(badSpec.reason).toContain('spec');
	});

	it('normalizes names and defaults empty description', () => {
		const result = parseCustomCommandDraft(JSON.stringify({ name: '  Greet ', spec: VALID_OUTPUT_SPEC() }));
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.draft.name).toBe('greet');
			expect(result.draft.description).toBe('');
		}
	});
});

function VALID_OUTPUT_SPEC() {
	return { version: 1, steps: [{ type: 'send_message', text: 'hi' }] };
}

describe('generateCustomCommandDraft', () => {
	it('returns the first valid output without retry', async () => {
		let calls = 0;
		const provider = {
			async chatCompletion() {
				calls++;
				return VALID_OUTPUT;
			}
		};
		const result = await generateCustomCommandDraft(provider, '인사말 보내고 3초 뒤 규칙 요약');
		expect(result.ok).toBe(true);
		expect(calls).toBe(1);
	});

	it('retries once with format feedback and fails on second bad output', async () => {
		let calls = 0;
		let secondContent = '';
		const provider = {
			async chatCompletion(_system: string, userContent: string) {
				calls++;
				secondContent = userContent;
				return '이건 JSON이 아니에요';
			}
		};
		const result = await generateCustomCommandDraft(provider, '인사말');
		expect(result.ok).toBe(false);
		expect(calls).toBe(2);
		expect(secondContent).toContain('형식에 맞지 않았어요');
	});

	it('recovers when the second attempt is valid', async () => {
		let calls = 0;
		const provider = {
			async chatCompletion() {
				calls++;
				return calls === 1 ? '먼저 이렇게 생각했어요' : VALID_OUTPUT;
			}
		};
		const result = await generateCustomCommandDraft(provider, '인사말');
		expect(result.ok).toBe(true);
		expect(calls).toBe(2);
	});
});
