import { describe, expect, it } from 'vitest';
import { normalizeEmojiName, suggestEmojiName } from './emojiName.ts';

describe('emoji names', () => {
	it('suggests a snake_case name within 32 chars', () => {
		expect(suggestEmojiName('Cat wearing sunglasses')).toBe('cat_wearing_sunglasses');
		expect(suggestEmojiName('a very long description that keeps going on and on').length).toBeLessThanOrEqual(32);
		expect(suggestEmojiName('a very long description that keeps going on and on').endsWith('_')).toBe(false);
		expect(suggestEmojiName('고양이')).toBe('siru_emoji');
		expect(suggestEmojiName('!')).toBe('siru_emoji');
	});

	it('normalizes user input or rejects it', () => {
		expect(normalizeEmojiName(' :cool cat: ')).toBe('cool_cat');
		expect(normalizeEmojiName('cool-cat')).toBe('cool_cat');
		expect(normalizeEmojiName('x')).toBeNull();
		expect(normalizeEmojiName('고양이')).toBeNull();
		expect(normalizeEmojiName('a'.repeat(33))).toBeNull();
	});
});
