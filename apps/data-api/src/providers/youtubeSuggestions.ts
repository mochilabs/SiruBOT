import { youtubeClient } from './youtubeClient.ts';

export async function fetchYouTubeSuggestionsFresh(query: string): Promise<string[]> {
	let suggestions: string[];
	try {
		suggestions = await (await youtubeClient()).getSearchSuggestions(query);
	} catch {
		throw new Error('YouTube suggestion lookup failed');
	}
	return [...new Set(suggestions.map((s) => s.trim()).filter(Boolean))].slice(0, 25);
}

export function youtubeSuggestionsCacheKey(query: string): string {
	return `dataapi:v1:youtube-suggestions:${query.trim().toLowerCase()}`;
}
