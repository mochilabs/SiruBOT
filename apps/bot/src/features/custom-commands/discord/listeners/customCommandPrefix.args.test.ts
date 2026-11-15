import { describe, expect, it } from 'vitest';
import { parseCustomCommandArgs } from './customCommandPrefix.ts';

describe('parseCustomCommandArgs', () => {
	it('splits the rest into at most 5 argv tokens', () => {
		expect(parseCustomCommandArgs('a b c d e f g')).toEqual(['a', 'b', 'c', 'd', 'e']);
		expect(parseCustomCommandArgs('홍길동 반가워')).toEqual(['홍길동', '반가워']);
	});

	it('handles empty and padded input', () => {
		expect(parseCustomCommandArgs('')).toEqual([]);
		expect(parseCustomCommandArgs('   ')).toEqual([]);
		expect(parseCustomCommandArgs('  한 개  ')).toEqual(['한', '개']);
	});
});
