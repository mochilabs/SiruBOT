import { describe, expect, it } from 'vitest';
import {
	CUSTOM_COMMAND_MAX_ARGS,
	CUSTOM_COMMAND_MAX_TOTAL_DELAY_SECONDS,
	customCommandPayloadSchema,
	customCommandSpecSchema,
	customCommandSpecSchemaV2,
	normalizeCustomCommandName,
	normalizeCustomCommandPrefix,
	validateCustomCommandName,
	validateCustomCommandPrefix
} from './customCommand.ts';

describe('customCommandSpecSchema', () => {
	it('accepts a minimal send_message-only spec', () => {
		const result = customCommandSpecSchema.safeParse({ version: 1, steps: [{ type: 'send_message', text: '안녕' }] });
		expect(result.success).toBe(true);
	});

	it('rejects empty steps / unknown step types / oversized specs', () => {
		expect(customCommandSpecSchema.safeParse({ version: 1, steps: [] }).success).toBe(false);
		expect(customCommandSpecSchema.safeParse({ version: 1, steps: [{ type: 'play_music', query: 'x' }] }).success).toBe(false);
		expect(customCommandSpecSchema.safeParse({ version: 1, steps: [{ type: 'send_message', text: 'a'.repeat(2001) }] }).success).toBe(false);
		expect(customCommandSpecSchema.safeParse({ version: 3, steps: [{ type: 'send_message', text: 'x' }] }).success).toBe(false);
	});

	it('caps single delay and total delay', () => {
		expect(customCommandSpecSchema.safeParse({ version: 1, steps: [{ type: 'delay', seconds: 301 }] }).success).toBe(false);
		// 총합 상한(600)은 스텝 여럿으로만 넘길 수 있어요 (300 + 300 + 1 = 601)
		const tooLong = {
			version: 1,
			steps: [
				{ type: 'delay', seconds: 300 },
				{ type: 'delay', seconds: 300 },
				{ type: 'delay', seconds: 1 }
			]
		};
		// 300 + 300 = CUSTOM_COMMAND_MAX_TOTAL_DELAY_SECONDS 경계는 허용
		const boundary = {
			version: 1,
			steps: [
				{ type: 'delay', seconds: 300 },
				{ type: 'delay', seconds: 300 }
			]
		};
		expect(customCommandSpecSchema.safeParse(tooLong).success).toBe(false);
		expect(customCommandSpecSchema.safeParse(boundary).success).toBe(true);
		expect(CUSTOM_COMMAND_MAX_TOTAL_DELAY_SECONDS).toBe(600);
	});
});

describe('customCommandSpecSchemaV2 — 신규 스텝', () => {
	it('accepts every v2 step type at least once', () => {
		const result = customCommandSpecSchemaV2.safeParse({
			version: 2,
			access: { mode: 'roles', roleIds: ['123456789012345678'] },
			steps: [
				{ type: 'send_message', text: '안녕' },
				{ type: 'delay', seconds: 1 },
				{ type: 'add_role', roleId: '123456789012345678' },
				{ type: 'remove_role', roleId: '234567890123456789' },
				{ type: 'add_reaction', emoji: '🎉' },
				{ type: 'pin_message' },
				{ type: 'delete_trigger', afterSeconds: 5 },
				{
					type: 'if',
					condition: { kind: 'has_role', roleId: '123456789012345678' },
					then: [{ type: 'send_message', text: '역할 있음' }],
					else: [{ type: 'send_message', text: '역할 없음' }]
				}
			]
		});
		expect(result.success).toBe(true);
	});

	it('accepts v1 specs unchanged (호환)', () => {
		expect(customCommandSpecSchema.safeParse({ version: 1, steps: [{ type: 'send_message', text: 'hi' }] }).success).toBe(true);
		expect(customCommandSpecSchema.safeParse({ version: 2, steps: [{ type: 'send_message', text: 'x' }] }).success).toBe(true);
	});

	it('requires role actions to have access control', () => {
		const noAccess = {
			version: 2,
			steps: [{ type: 'add_role', roleId: '123456789012345678' }]
		};
		expect(customCommandSpecSchemaV2.safeParse(noAccess).success).toBe(false);
		expect(
			customCommandSpecSchemaV2.safeParse({
				...noAccess,
				access: { mode: 'roles', roleIds: ['123456789012345678'] }
			}).success
		).toBe(true);
		expect(
			customCommandSpecSchemaV2.safeParse({
				version: 2,
				access: { mode: 'roles' },
				steps: [{ type: 'send_message', text: 'x' }]
			}).success
		).toBe(false); // roles 모드인데 roleIds 없음
	});

	it('rejects nested if and oversized then/else', () => {
		const innerIf = { type: 'if', condition: { kind: 'channel_match', channelId: '123456789012345678' }, then: [{ type: 'pin_message' }] };
		expect(
			customCommandSpecSchemaV2.safeParse({
				version: 2,
				steps: [{ type: 'if', condition: { kind: 'has_role', roleId: '123456789012345678' }, then: [innerIf] }]
			}).success
		).toBe(false);
		const tooMany = Array.from({ length: 11 }, () => ({ type: 'pin_message' }));
		expect(
			customCommandSpecSchemaV2.safeParse({
				version: 2,
				steps: [{ type: 'if', condition: { kind: 'has_role', roleId: '123456789012345678' }, then: tooMany }]
			}).success
		).toBe(false);
	});

	it('counts nested if delays toward the total cap', () => {
		expect(
			customCommandSpecSchemaV2.safeParse({
				version: 2,
				steps: [
					{ type: 'delay', seconds: 300 },
					{
						type: 'if',
						condition: { kind: 'arg_matches', index: 0, value: 'x' },
						then: [{ type: 'delay', seconds: 301 }]
					}
				]
			}).success
		).toBe(false);
	});

	it('validates send_message content and CV2 design limits', () => {
		// 둘 다 없으면 실패
		expect(customCommandSpecSchemaV2.safeParse({ version: 2, steps: [{ type: 'send_message' }] }).success).toBe(false);
		// design은 https URL만, items ≤10, media urls ≤10
		const httpDesign = {
			version: 2,
			steps: [
				{
					type: 'send_message',
					design: { items: [{ kind: 'media', urls: ['http://example.com/a.png'] }] }
				}
			]
		};
		expect(customCommandSpecSchemaV2.safeParse(httpDesign).success).toBe(false);
		const bigDesign = {
			version: 2,
			steps: [
				{
					type: 'send_message',
					design: {
						items: Array.from({ length: 11 }, () => ({ kind: 'text', content: 'x' }))
					}
				}
			]
		};
		expect(customCommandSpecSchemaV2.safeParse(bigDesign).success).toBe(false);
		const okDesign = {
			version: 2,
			steps: [
				{
					type: 'send_message',
					design: {
						accentColor: 'blue',
						items: [
							{ kind: 'text', content: '## 공지' },
							{ kind: 'separator' },
							{ kind: 'section', content: '본문', thumbnailUrl: 'https://example.com/a.png' },
							{ kind: 'media', urls: ['https://example.com/b.png'] }
						]
					}
				}
			]
		};
		expect(customCommandSpecSchemaV2.safeParse(okDesign).success).toBe(true);
	});

	it('exports the argv substitution bound', () => {
		expect(CUSTOM_COMMAND_MAX_ARGS).toBe(5);
	});
});

describe('customCommandPayloadSchema — 실행 방식', () => {
	const baseSpec = { version: 2, steps: [{ type: 'send_message', text: 'x' }] };

	it('accepts both methods with valid names', () => {
		expect(customCommandPayloadSchema.safeParse({ name: '아침브리핑', method: 'prefix', spec: baseSpec }).success).toBe(true);
		expect(customCommandPayloadSchema.safeParse({ name: '아침브리핑', method: 'slash', description: '설명', spec: baseSpec }).success).toBe(true);
	});

	it('rejects slash names the Discord pattern forbids', () => {
		// 라틴 대문자 금지, 공백 금지, 33자 초과 금지
		expect(customCommandPayloadSchema.safeParse({ name: 'Greet', method: 'slash', description: 'd', spec: baseSpec }).success).toBe(false);
		expect(customCommandPayloadSchema.safeParse({ name: 'has space', method: 'slash', description: 'd', spec: baseSpec }).success).toBe(false);
		expect(customCommandPayloadSchema.safeParse({ name: 'a'.repeat(33), method: 'slash', description: 'd', spec: baseSpec }).success).toBe(false);
		// 한글·소문자·하이픈/언더스코어는 통과
		expect(customCommandPayloadSchema.safeParse({ name: 'greet-v2_x', method: 'slash', description: 'd', spec: baseSpec }).success).toBe(true);
	});

	it('requires a description for slash commands and rejects v1 specs in new payloads', () => {
		expect(customCommandPayloadSchema.safeParse({ name: 'greet', method: 'slash', spec: baseSpec }).success).toBe(false);
		expect(
			customCommandPayloadSchema.safeParse({
				name: 'greet',
				method: 'prefix',
				spec: { version: 1, steps: [{ type: 'send_message', text: 'x' }] }
			}).success
		).toBe(false);
	});
});

describe('normalizeCustomCommandName', () => {
	it('trims and lowercases', () => {
		expect(normalizeCustomCommandName('  Greet  ')).toBe('greet');
		expect(normalizeCustomCommandName('아침브리핑')).toBe('아침브리핑');
	});
});

describe('validateCustomCommandName', () => {
	it('rejects empty, spaced, long and reserved names', () => {
		expect(validateCustomCommandName('')).not.toBeNull();
		expect(validateCustomCommandName('두 단어')).not.toBeNull();
		expect(validateCustomCommandName('a'.repeat(21))).not.toBeNull();
		expect(validateCustomCommandName('도움말')).not.toBeNull();
	});

	it('accepts Korean and ASCII single-token names', () => {
		expect(validateCustomCommandName('아침브리핑')).toBeNull();
		expect(validateCustomCommandName('greet')).toBeNull();
	});
});

describe('prefix', () => {
	it('validates prefix rules', () => {
		expect(validateCustomCommandPrefix('')).not.toBeNull();
		expect(validateCustomCommandPrefix('!!!!')).not.toBeNull();
		expect(validateCustomCommandPrefix('a b')).not.toBeNull();
		expect(validateCustomCommandPrefix('!')).toBeNull();
		expect(validateCustomCommandPrefix('시루야')).toBeNull();
	});

	it('normalizes invalid stored values back to default', () => {
		expect(normalizeCustomCommandPrefix('?')).toBe('?');
		expect(normalizeCustomCommandPrefix('')).toBe('!');
		expect(normalizeCustomCommandPrefix(null)).toBe('!');
		expect(normalizeCustomCommandPrefix('공백 접두사')).toBe('!');
	});
});
