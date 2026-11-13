import { describe, expect, it } from 'vitest';
import { applyPronunciations } from './ttsPronunciation.ts';

describe('applyPronunciations', () => {
	it('항목이 없으면 원문 그대로', () => {
		expect(applyPronunciations('안녕', [])).toBe('안녕');
	});

	it('긴 단어를 먼저 치환하고 대소문자는 구분하지 않는다', () => {
		const entries = [
			{ term: '시루', reading: '시루떡' },
			{ term: '시루봇', reading: '시루 봇' },
			{ term: 'LOL', reading: '엘오엘' }
		];
		expect(applyPronunciations('시루봇 lol 시루', entries)).toBe('시루 봇 엘오엘 시루떡');
	});

	it('정규식 특수문자는 글자 그대로 취급한다', () => {
		expect(applyPronunciations('c++ 좋아', [{ term: 'c++', reading: '씨플플' }])).toBe('씨플플 좋아');
	});
});
