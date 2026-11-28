import { container } from '@sapphire/framework';
import { ButtonInteraction, ChatInputCommandInteraction, ComponentType, ContainerBuilder, MessageFlags } from 'discord.js';
import type { Player, SearchResult, Track, UnresolvedTrack } from 'lavalink-client';
import * as view from '../views/play.ts';
import { playlistAddId } from '../customIds.ts';
import { createComponentSession, type ComponentSession } from '../../../../lib/componentSession.ts';
import type { MusicPlayResult } from '../../application/play.ts';

type PlayTrack = Track | UnresolvedTrack;
type PlayPlaylist = NonNullable<SearchResult['playlist']>;
type PlayResult = MusicPlayResult<Player, PlayTrack, PlayPlaylist>;

export async function trackPlayFeedback(player: Player, track: PlayTrack, userId: string, wasIdle: boolean): Promise<ContainerBuilder[]> {
	if (wasIdle && (await container.audioService.isControllerEnabled(player.guildId))) {
		return [view.playStarted({ track: track as Track, userId })];
	}
	return [view.trackAdded(view.trackAddedProps(player, track as Track))];
}

export async function editTrackPlayReply(
	interaction: ChatInputCommandInteraction<'cached'>,
	player: Player,
	track: PlayTrack,
	wasIdle: boolean
): Promise<void> {
	const components = await trackPlayFeedback(player, track, interaction.user.id, wasIdle);
	await interaction
		.editReply({
			flags: MessageFlags.IsComponentsV2,
			components,
			allowedMentions: { users: [], roles: [] }
		})
		.catch((error) => container.logger.warn(`[audio] track feedback edit failed (guild ${player.guildId}): ${error}`));
}

export async function replyPlaylistPlay(interaction: ChatInputCommandInteraction<'cached'>, result: PlayResult): Promise<void> {
	const playlist = result.playlist;
	if (!playlist) return;

	const selectedTrack = playlist.selectedTrack;
	if (!selectedTrack) {
		await interaction.editReply({
			flags: MessageFlags.IsComponentsV2,
			components: [view.playlistQueued({ playlist, tracks: result.queued as Track[] })],
			allowedMentions: { users: [], roles: [] }
		});
		return;
	}

	if (result.remaining.length > 0) {
		await promptRemainingPlaylist(interaction, result.player, playlist, selectedTrack, result.remaining, () =>
			container.musicPlay.enqueue(result.player, result.remaining)
		);
		return;
	}

	await editTrackPlayReply(interaction, result.player, selectedTrack, result.wasIdle);
}

async function promptRemainingPlaylist(
	interaction: ChatInputCommandInteraction<'cached'>,
	player: Player,
	playlist: PlayPlaylist,
	selectedTrack: Track,
	remainingTracks: PlayTrack[],
	addRemaining: () => Promise<unknown>
): Promise<void> {
	const askReply = await interaction.editReply({
		flags: MessageFlags.IsComponentsV2,
		components: [
			view.askPlaylistAdd({
				playlist,
				selectedTrack,
				remainTracks: remainingTracks as Track[],
				player
			})
		],
		allowedMentions: { users: [], roles: [] }
	});

	const trackAdded = view.trackAdded(view.trackAddedProps(player, selectedTrack));

	const handleEndAction = async () => {
		await interaction
			.editReply({
				flags: MessageFlags.IsComponentsV2,
				components: [trackAdded],
				allowedMentions: { users: [], roles: [] }
			})
			.catch((error) => container.logger.warn(`[audio] trackAdded edit failed (guild ${player.guildId}): ${error}`));
	};

	let pressed = false;
	const handleButtonAction = async (collectorInteraction: ButtonInteraction<'cached'>, session: ComponentSession) => {
		if (pressed) return;
		pressed = true;
		await collectorInteraction.deferUpdate();
		if (!player.connected) return;
		session.settle();

		const action = playlistAddId.decode(collectorInteraction.customId)?.action;

		if (action === 'addRemaining') {
			await addRemaining();

			await collectorInteraction.editReply({
				flags: MessageFlags.IsComponentsV2,
				components: [
					view.playlistQueued({
						playlist,
						tracks: remainingTracks as Track[]
					})
				],
				allowedMentions: { users: [], roles: [] }
			});
		} else if (action === 'skipRemaining') {
			await collectorInteraction.editReply({
				flags: MessageFlags.IsComponentsV2,
				components: [trackAdded],
				allowedMentions: { users: [], roles: [] }
			});
		}
	};

	createComponentSession<ButtonInteraction<'cached'>>(askReply, {
		filter: (i) => i.user.id === interaction.user.id && playlistAddId.decode(i.customId) !== null,
		time: 30000,
		componentType: ComponentType.Button,
		onCollect: handleButtonAction,
		onTimeout: handleEndAction
	});
}
