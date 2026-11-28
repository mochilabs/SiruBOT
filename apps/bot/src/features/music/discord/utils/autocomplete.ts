import { container } from '@sapphire/framework';
import type { AutocompleteInteraction } from 'discord.js';
import { CHOICE_LIMIT, clipChoiceName } from '../../../../lib/autocomplete.ts';
import { getSimpleYouTubeSuggestions } from '../../../../services/dataApiClient.ts';
import type { TrackSuggestion } from '../../application/trackSuggestions.ts';
import { getUserQueuedTracks } from '../../lavalink/autoPlayRelated.ts';
import { queueSelectionValue } from './queueSelection.ts';

export async function respondQueuedTracks(interaction: AutocompleteInteraction): Promise<void> {
	if (!interaction.inCachedGuild()) return interaction.respond([]);

	const player = container.audio.getPlayer(interaction.guildId);
	const tracks = player ? getUserQueuedTracks(player) : [];

	const focused = interaction.options.getFocused(true);
	const typed = typeof focused.value === 'string' ? focused.value.trim().replace(/^#/, '') : '';
	const parsed = Number.parseInt(typed, 10);
	const offset = Number.isInteger(parsed) && parsed > 0 ? parsed - 1 : 0;

	await interaction.respond(
		player
			? tracks
					.map((track, index) => ({ name: clipChoiceName(`#${index + 1} ${track.info.title}`), value: queueSelectionValue(player, index) }))
					.filter((entry, index) =>
						Number.isInteger(parsed) ? index >= offset : entry.name.toLocaleLowerCase().includes(typed.toLocaleLowerCase())
					)
					.slice(0, CHOICE_LIMIT)
			: []
	);
}

export async function respondPlaylistNames(interaction: AutocompleteInteraction): Promise<void> {
	const typed = interaction.options.getFocused().trim().toLowerCase();
	const playlists = await container.playlistService.getUserPlaylists(interaction.user.id).catch(() => []);

	await interaction.respond(
		playlists
			.filter((playlist) => playlist.name.toLowerCase().includes(typed))
			.slice(0, CHOICE_LIMIT)
			.map((playlist) => ({
				name: clipChoiceName(`${playlist.name} (${playlist._count.tracks}곡)`),
				value: playlist.name
			}))
	);
}

export async function respondPlaylistTrackPositions(interaction: AutocompleteInteraction, playlistName: string | null): Promise<void> {
	if (!playlistName) return interaction.respond([]);

	const result = await container.playlistService.getPlaylistTracks(interaction.user.id, playlistName).catch(() => null);
	if (!result) return interaction.respond([]);

	await interaction.respond(
		result.tracks
			.map((entry, index) => ({ name: clipChoiceName(`#${index + 1} ${entry.track.title}`), value: entry.id }))
			.filter((entry) => entry.name.toLocaleLowerCase().includes(String(interaction.options.getFocused()).toLocaleLowerCase()))
			.slice(0, CHOICE_LIMIT)
	);
}

const CHOICE_VALUE_MAX = 100;
const HISTORY_MATCH_LIMIT = 5;
const UNKNOWN_ARTIST = '(아티스트 정보 없음)';
const DEFAULT_QUERIES = ['인기 음악', '최신 K-POP', '팝송 모음', '힙합 음악', '발라드 명곡', '일본 음악', '클래식 음악', '재즈 음악'];

export type PlayQueryMode = 'play' | 'search';
interface Choice {
	name: string;
	value: string;
}

function clipValue(text: string): string {
	let clipped = '';
	for (const char of text) {
		if (clipped.length + char.length > CHOICE_VALUE_MAX) break;
		clipped += char;
	}
	return clipped;
}

function historyChoice(track: TrackSuggestion, mode: PlayQueryMode): Choice {
	const hasArtist = track.artist.length > 0 && track.artist !== UNKNOWN_ARTIST;
	const useUrl = mode === 'play' && /^https?:\/\//.test(track.url) && track.url.length <= CHOICE_VALUE_MAX;
	return {
		name: clipChoiceName(hasArtist ? `${track.title} - ${track.artist}` : track.title),
		value: useUrl ? track.url : clipValue(hasArtist ? `${track.title} ${track.artist}` : track.title)
	};
}

function textChoice(text: string): Choice {
	return { name: clipChoiceName(text), value: clipValue(text) };
}

function uniqueChoices(choices: Choice[]): Choice[] {
	const seen = new Set<string>();
	const unique: Choice[] = [];
	for (const choice of choices) {
		if (seen.has(choice.value)) continue;
		seen.add(choice.value);
		unique.push(choice);
	}
	return unique.slice(0, CHOICE_LIMIT);
}

export async function buildPlayQueryChoices(input: {
	query: string;
	mode: PlayQueryMode;
	loadHistory: () => Promise<readonly TrackSuggestion[]>;
	fetchSuggestions: (query: string) => Promise<string[]>;
}): Promise<Choice[]> {
	const query = input.query.trim();
	const needle = query.toLocaleLowerCase();
	const [history, suggestions] = await Promise.all([input.loadHistory(), query.length < 2 ? Promise.resolve([]) : input.fetchSuggestions(query)]);
	const matches = history
		.filter((track) => track.title.toLocaleLowerCase().includes(needle) || track.artist.toLocaleLowerCase().includes(needle))
		.map((track) => historyChoice(track, input.mode));

	if (query.length < 2) return matches.length > 0 ? uniqueChoices(matches) : DEFAULT_QUERIES.map(textChoice);

	const fallback = suggestions.length > 0 ? suggestions : [query];
	return uniqueChoices([...matches.slice(0, HISTORY_MATCH_LIMIT), ...fallback.map(textChoice)]);
}

export async function respondPlayQuery(interaction: AutocompleteInteraction, mode: PlayQueryMode): Promise<void> {
	const focused = interaction.options.getFocused(true);
	if (focused.name !== 'query') return interaction.respond([]);

	const choices = await buildPlayQueryChoices({
		query: String(focused.value),
		mode,
		loadHistory: () =>
			container.trackSuggestions.getForUser(interaction.user.id).catch((error: unknown) => {
				container.logger.warn(`[autocomplete] play history lookup failed: ${error instanceof Error ? error.message : String(error)}`);
				return [];
			}),
		fetchSuggestions: (query) => getSimpleYouTubeSuggestions(query, CHOICE_LIMIT).catch(() => [])
	});
	await interaction.respond(choices);
}
