import { describe, expect, it } from 'vitest';
import { filterYouTubeSuggestions, type YouTubeSuggestion } from './youtube.ts';

function suggestion(query: string, relevance?: number[]): YouTubeSuggestion {
	return { query, type: 4, relevance };
}

describe('filterYouTubeSuggestions', () => {
	it('추천어 목록을 그대로 뽑아요', () => {
		expect(filterYouTubeSuggestions([suggestion('a'), suggestion('b')])).toEqual(['a', 'b']);
	});

	it('중복은 대소문자·공백을 무시하고 제거해요 (첫 항목 유지)', () => {
		expect(filterYouTubeSuggestions([suggestion('IU'), suggestion(' iu '), suggestion('bb')])).toEqual(['IU', 'bb']);
	});

	it('filterDuplicates를 끄면 중복을 유지해요', () => {
		expect(filterYouTubeSuggestions([suggestion('a'), suggestion('a')], 10, false)).toEqual(['a', 'a']);
	});

	it('관련도 높은 순으로 정렬해요', () => {
		const sorted = filterYouTubeSuggestions([suggestion('low', [0.1]), suggestion('high', [0.9]), suggestion('mid', [0.5])]);
		expect(sorted).toEqual(['high', 'mid', 'low']);
	});

	it('maxResults로 잘라요', () => {
		expect(filterYouTubeSuggestions([suggestion('a'), suggestion('b'), suggestion('c')], 2)).toEqual(['a', 'b']);
	});
});
