import { describe, expect, it, vi } from 'vitest';
import { fetch } from 'undici';
import { filterYouTubeSuggestions, getYouTubeSuggestions, type YouTubeSuggestion } from './youtube.ts';

vi.mock('undici', () => ({ fetch: vi.fn() }));

function suggestion(query: string, relevance?: number[]): YouTubeSuggestion {
	return { query, relevance };
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

describe('getYouTubeSuggestions', () => {
	it('JSONP 응답에서 쿼리와 추천어를 파싱해요', async () => {
		const body = 'window.google.ac.h(["레나",[["아이유",4,null,[0.9]],["아이유 노래",4,null,[0.5]]],{"j":"session"}]);';
		vi.mocked(fetch).mockResolvedValue({ ok: true, text: async () => body } as never);

		const result = await getYouTubeSuggestions('레나');

		expect(result.query).toBe('레나');
		expect(result.suggestions.map((item) => item.query)).toEqual(['아이유', '아이유 노래']);
	});

	it('JSONP 형식이 아니면 실패해요', async () => {
		vi.mocked(fetch).mockResolvedValue({ ok: true, text: async () => '<html>bad</html>' } as never);
		await expect(getYouTubeSuggestions('x')).rejects.toThrow('Failed to parse suggestions');
	});

	it('HTTP 응답이 실패면 실패해요', async () => {
		vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500, statusText: 'ISE' } as never);
		await expect(getYouTubeSuggestions('x')).rejects.toThrow('Failed to fetch suggestions');
	});
});
