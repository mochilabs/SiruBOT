import { describe, expect, it, vi } from 'vitest';
import { fetchYouTubeSuggestionsFresh } from './youtubeSuggestions.ts';

vi.mock('./youtubeClient.ts', () => ({
	youtubeClient: vi.fn(async () => ({
		getSearchSuggestions: vi.fn(async () => ['  아이유  ', '아이유', '아이유 노래', ''])
	}))
}));

describe('YouTube.js autocomplete', () => {
	it('returns trimmed unique suggestions from the library', async () => {
		await expect(fetchYouTubeSuggestionsFresh('아이유')).resolves.toEqual(['아이유', '아이유 노래']);
	});
});
