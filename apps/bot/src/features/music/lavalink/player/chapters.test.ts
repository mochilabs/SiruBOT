import { describe, expect, it } from 'vitest';
import { chapterPickValue, chapterStartFromPick } from './chapters.ts';

const chapters = [{ start: 0 }, { start: 60_000 }, { start: 120_000 }];

describe('chapterStartFromPick', () => {
	it('returns the start of the picked chapter', () => {
		expect(chapterStartFromPick(chapters, 'vid', chapterPickValue(1, 60_000, 'vid'))).toBe(60_000);
	});

	it('rejects a pick made on an earlier track even when index and start match', () => {
		expect(chapterStartFromPick(chapters, 'vid', chapterPickValue(0, 0, 'old'))).toBeNull();
		expect(chapterStartFromPick(chapters, null, chapterPickValue(0, 0, null))).toBeNull();
	});

	it('rejects a pick from a different track or malformed value', () => {
		expect(chapterStartFromPick(chapters, 'vid', '1:61000:vid')).toBeNull();
		expect(chapterStartFromPick(chapters, 'vid', '5:0:vid')).toBeNull();
		expect(chapterStartFromPick(chapters, 'vid', '1:60000')).toBeNull();
		expect(chapterStartFromPick(chapters, 'vid', 'x')).toBeNull();
	});
});
