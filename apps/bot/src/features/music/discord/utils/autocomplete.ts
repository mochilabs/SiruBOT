import { container } from '@sapphire/framework';
import type { AutocompleteInteraction } from 'discord.js';
import { CHOICE_LIMIT, clipChoiceName } from '../../../../lib/autocomplete.ts';
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
