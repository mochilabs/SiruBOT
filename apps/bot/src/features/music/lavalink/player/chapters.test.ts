import { describe, expect, it } from 'vitest';
import { chapterStartFromPick } from './chapters.ts';

const chapters = [{ start: 0 }, { start: 60_000 }, { start: 120_000 }];

describe('chapterStartFromPick', () => {
	it('returns the start of the picked chapter', () => {
		expect(chapterStartFromPick(chapters, '1:60000')).toBe(60_000);
	});

	it('rejects a pick from a different track or malformed value', () => {
		expect(chapterStartFromPick(chapters, '1:61000')).toBeNull();
		expect(chapterStartFromPick(chapters, '5:0')).toBeNull();
		expect(chapterStartFromPick(chapters, 'x')).toBeNull();
	});
});
