import { describe, expect, it } from 'vitest';
import { diffCommandNames, formatCommandDiff, hasCommandDiff } from './commandRegistrationDiff.ts';

describe('diffCommandNames', () => {
	it('양쪽에만 있는 이름을 정렬해서 돌려줘요', () => {
		const diff = diffCommandNames(['play', 'help', 'settings'], ['help', 'config', 'play']);
		expect(diff).toEqual({ missing: ['settings'], extra: ['config'] });
		expect(hasCommandDiff(diff)).toBe(true);
		expect(formatCommandDiff(diff)).toBe('등록 안 됨: /settings · 소스에 없음: /config');
	});

	it('같으면 차이가 없어요', () => {
		const diff = diffCommandNames(['a', 'b'], ['b', 'a']);
		expect(hasCommandDiff(diff)).toBe(false);
		expect(formatCommandDiff(diff)).toBe('');
	});
});
