import { describe, expect, it } from 'vitest';
import { buildLyricsText, hasTranslation } from './lyricsText.ts';

const base = {
	plainLyrics: null,
	syncedLyrics: '[00:01.00]Hello\n[00:02.00]안녕',
	translation: { status: 'ready' as const, lines: { Hello: '안녕하세요' } }
};

describe('buildLyricsText', () => {
	it('returns the original without timestamps', () => {
		expect(buildLyricsText(base, 'original')).toBe('Hello\n안녕');
	});
	it('replaces lines in translation mode and falls back for untranslated lines', () => {
		expect(buildLyricsText(base, 'translation')).toBe('안녕하세요\n안녕');
	});
	it('puts the translation under the original in both mode', () => {
		expect(buildLyricsText(base, 'both')).toBe('Hello\n-# 안녕하세요\n안녕');
	});
	it('ignores translation that is pending', () => {
		const pending = { ...base, translation: { status: 'pending' as const, lines: null } };
		expect(hasTranslation(pending)).toBe(false);
		expect(buildLyricsText(pending, 'both')).toBe('Hello\n안녕');
	});
});
