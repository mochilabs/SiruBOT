import { describe, expect, it } from 'vitest';
import { findActiveLineIndex, findActiveWordIndex, parseLrc } from './lrc.js';

describe('parseLrc', () => {
	it('parses mm:ss.xx lines in time order', () => {
		const lines = parseLrc('[00:12.50] 둘째\n[00:01.00] 첫째\n[01:02.345] 셋째');
		expect(lines).toEqual([
			{ startMs: 1_000, text: '첫째' },
			{ startMs: 12_500, text: '둘째' },
			{ startMs: 62_345, text: '셋째' }
		]);
	});

	it('reads fractions of any width as decimals', () => {
		const lines = parseLrc('[00:01.5] a\n[00:01.50] b\n[00:01.500] c\n[00:01] d\n[00:01:25] e');
		expect(lines.map((l) => l.startMs)).toEqual([1_000, 1_250, 1_500, 1_500, 1_500].sort((a, b) => a - b));
		expect(lines.find((l) => l.text === 'd')!.startMs).toBe(1_000);
		expect(lines.find((l) => l.text === 'e')!.startMs).toBe(1_250);
		expect(lines.find((l) => l.text === 'a')!.startMs).toBe(1_500);
	});

	it('expands several timestamps on one line', () => {
		expect(parseLrc('[00:10.00][01:20.00]후렴')).toEqual([
			{ startMs: 10_000, text: '후렴' },
			{ startMs: 80_000, text: '후렴' }
		]);
	});

	it('ignores tag lines, free text and invalid stamps', () => {
		const lrc = ['[ar:IVE]', '[ti:LOVE DIVE]', '[by:someone]', '그냥 글', '[00:61.00] 잘못', '[00:05.00] 진짜'].join('\n');
		expect(parseLrc(lrc)).toEqual([{ startMs: 5_000, text: '진짜' }]);
	});

	it('keeps empty lyric lines (instrumental gaps)', () => {
		expect(parseLrc('[00:05.00] 노래\n[00:09.00]\n[00:12.00] 또')).toEqual([
			{ startMs: 5_000, text: '노래' },
			{ startMs: 9_000, text: '' },
			{ startMs: 12_000, text: '또' }
		]);
	});

	it('applies the offset tag (positive = earlier) and clamps at zero', () => {
		expect(parseLrc('[offset:+500]\n[00:01.00] a\n[00:10.00] b')).toEqual([
			{ startMs: 500, text: 'a' },
			{ startMs: 9_500, text: 'b' }
		]);
		expect(parseLrc('[offset:-250]\n[00:01.00] a')[0]!.startMs).toBe(1_250);
		expect(parseLrc('[offset:+5000]\n[00:01.00] a')[0]!.startMs).toBe(0);
	});

	it('strips enhanced inline word stamps and handles CRLF', () => {
		expect(parseLrc('[00:01.00]<00:01.00>안녕 <00:01.50>하세요\r\n[00:03.00]끝\r\n')).toEqual([
			{ startMs: 1_000, text: '안녕 하세요' },
			{ startMs: 3_000, text: '끝' }
		]);
	});

	it('keeps input order for equal times', () => {
		expect(parseLrc('[00:01.00] a\n[00:01.00] b').map((l) => l.text)).toEqual(['a', 'b']);
	});

	it('returns an empty list for empty or untimed input', () => {
		expect(parseLrc('')).toEqual([]);
		expect(parseLrc('가사만\n있어요')).toEqual([]);
	});
});

describe('findActiveLineIndex / findActiveWordIndex', () => {
	const lines = [
		{ startMs: 1_000, text: 'a' },
		{ startMs: 5_000, text: 'b' },
		{ startMs: 9_000, text: 'c' }
	];

	it('is -1 before the first line', () => {
		expect(findActiveLineIndex(lines, 0)).toBe(-1);
		expect(findActiveLineIndex(lines, 999)).toBe(-1);
	});

	it('picks the last line that started', () => {
		expect(findActiveLineIndex(lines, 1_000)).toBe(0);
		expect(findActiveLineIndex(lines, 4_999)).toBe(0);
		expect(findActiveLineIndex(lines, 5_000)).toBe(1);
		expect(findActiveLineIndex(lines, 999_999)).toBe(2);
	});

	it('handles empty lists and words', () => {
		expect(findActiveLineIndex([], 1_000)).toBe(-1);
		const words = [
			{ startMs: 100, text: '가 ' },
			{ startMs: 400, text: '나' }
		];
		expect(findActiveWordIndex(words, 50)).toBe(-1);
		expect(findActiveWordIndex(words, 450)).toBe(1);
	});
});
