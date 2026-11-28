import { describe, expect, it, vi } from 'vitest';
import { buildPlayQueryChoices } from './autocomplete.ts';

const history = [
	{ title: '좋은 날', artist: 'IU', url: 'https://www.youtube.com/watch?v=jeqdYqsrsA0' },
	{ title: 'Hype Boy', artist: 'NewJeans', url: 'https://www.youtube.com/watch?v=11cta61wi0g' },
	{ title: 'untitled', artist: '(아티스트 정보 없음)', url: `https://example.com/${'x'.repeat(120)}` }
];

const noSuggestions = vi.fn(async () => []);

describe('buildPlayQueryChoices', () => {
	it('shows the history as "title - artist" with the track URL for play when nothing is typed', async () => {
		const choices = await buildPlayQueryChoices({ query: '', mode: 'play', history, fetchSuggestions: noSuggestions });
		expect(choices).toEqual([
			{ name: '좋은 날 - IU', value: history[0]!.url },
			{ name: 'Hype Boy - NewJeans', value: history[1]!.url },
			{ name: 'untitled', value: 'untitled' }
		]);
		expect(noSuggestions).not.toHaveBeenCalled();
	});

	it('sends a search query instead of the URL for search', async () => {
		const choices = await buildPlayQueryChoices({ query: '', mode: 'search', history, fetchSuggestions: noSuggestions });
		expect(choices[0]).toEqual({ name: '좋은 날 - IU', value: '좋은 날 IU' });
	});

	it('falls back to the default queries when the user has no history', async () => {
		const choices = await buildPlayQueryChoices({ query: '', mode: 'play', history: [], fetchSuggestions: noSuggestions });
		expect(choices[0]).toEqual({ name: '인기 음악', value: '인기 음악' });
	});

	it('filters the history by one typed character', async () => {
		const choices = await buildPlayQueryChoices({ query: 'n', mode: 'play', history, fetchSuggestions: noSuggestions });
		expect(choices.map((choice) => choice.name)).toEqual(['Hype Boy - NewJeans', 'untitled']);
	});

	it('puts matching history above YouTube suggestions and drops duplicates', async () => {
		const fetchSuggestions = vi.fn(async () => ['hype boy', 'hype boy']);
		const choices = await buildPlayQueryChoices({ query: 'hype', mode: 'search', history, fetchSuggestions });
		expect(choices).toEqual([
			{ name: 'Hype Boy - NewJeans', value: 'Hype Boy NewJeans' },
			{ name: 'hype boy', value: 'hype boy' }
		]);
	});

	it('still offers the typed query when suggestions fail', async () => {
		const fetchSuggestions = vi.fn(async () => {
			throw new Error('down');
		});
		const choices = await buildPlayQueryChoices({ query: 'zzz', mode: 'play', history, fetchSuggestions });
		expect(choices).toEqual([{ name: 'zzz', value: 'zzz' }]);
	});
});
