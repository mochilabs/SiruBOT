import { container } from '@sapphire/framework';
import { ButtonInteraction, ChatInputCommandInteraction, ComponentType, ContainerBuilder, MessageFlags } from 'discord.js';
import type { Player, SearchResult, Track, UnresolvedTrack } from 'lavalink-client';
import * as view from '../views/play.ts';
import { createComponentSession, type ComponentSession } from '../../../../lib/componentSession.ts';
import type { MusicPlayResult } from '../../application/play.ts';

/**
 * 재생 요청의 응답 문구 — 곡 추가 뒤 피드백과 플레이리스트 선택 흐름을 한 곳에서 그려요.
 * 곡을 넣고 재생을 보장하는 일은 유스케이스(`container.musicPlay`)가 맡고, 여기서는 화면만 만들어요.
 */

type PlayTrack = Track | UnresolvedTrack;
type PlayPlaylist = NonNullable<SearchResult['playlist']>;
type PlayResult = MusicPlayResult<Player, PlayTrack, PlayPlaylist>;

/** 곡 하나가 대기열에 들어간 뒤의 피드백 — 곧바로 재생이면 '재생 시작'(누가 시작했는지 포함), 아니면 '대기열 추가'예요. */
export async function trackPlayFeedback(player: Player, track: PlayTrack, userId: string, wasIdle: boolean): Promise<ContainerBuilder[]> {
	if (wasIdle && (await container.audioService.isControllerEnabled(player.guildId))) {
		// 컨트롤러가 뒤따라 오지만, 누가 재생을 시작했는지는 채팅에도 남겨요.
		return [view.playStarted({ track: track as Track, userId })];
	}
	return [view.trackAdded(view.trackAddedProps(player, track as Track))];
}

/** 인터랙션 응답을 곡 추가 피드백으로 바꿔요 (/재생 단일 곡, /검색 선택 후). */
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

/**
 * /재생의 플레이리스트 결과 응답 — URL로 고른 곡이 있으면 그 곡을 먼저 넣고 나머지는 물어봐요.
 * 선택 곡이 없으면 전체를 넣고 플레이리스트 요약을 보여줘요.
 */
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

/**
 * 선택 곡을 넣은 뒤 플레이리스트의 나머지 곡을 넣을지 30초 동안 물어봐요.
 * 첫 입력만 처리하고, 시간이 지나면 선택 곡 피드백으로 마무리해요.
 */
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

	// 첫 입력만 처리해요 (플레이어가 끊겼으면 아무것도 하지 않고 시간 초과 때 trackAdded로 마무리해요).
	let pressed = false;
	const handleButtonAction = async (collectorInteraction: ButtonInteraction<'cached'>, session: ComponentSession) => {
		if (pressed) return;
		pressed = true;
		await collectorInteraction.deferUpdate();
		if (!player.connected) return;
		session.settle();

		const action = view.decodePlaylistAddId(collectorInteraction.customId)?.action;

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
		filter: (i) => i.user.id === interaction.user.id && view.decodePlaylistAddId(i.customId) !== null,
		time: 30000,
		componentType: ComponentType.Button,
		onCollect: handleButtonAction,
		onTimeout: handleEndAction
	});
}
