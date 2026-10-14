import { describe, expect, it } from 'vitest';
import {
	CUSTOM_COMMAND_MAX_TOTAL_DELAY_SECONDS,
	customCommandSpecSchema,
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
		expect(customCommandSpecSchema.safeParse({ version: 2, steps: [{ type: 'send_message', text: 'x' }] }).success).toBe(false);
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
