import { container, UserError } from '@sapphire/framework';
import { Player, SearchPlatform, Track, SearchResult, UnresolvedSearchResult } from 'lavalink-client';
import { APIUser, ButtonInteraction, ChatInputCommandInteraction, ComponentType, MessageFlags, PermissionsBitField } from 'discord.js';
import { SkipContext } from '../modules/audio/commands/skip.ts';
import { VoteSkip } from '../modules/audio/managers/voteSkip.ts';
import * as view from '../modules/audio/view/play.ts';
import * as skipView from '../modules/audio/view/skip.ts';

export class AudioService {
	/**
	 * Gets an existing player or creates a new one for the guild
	 */
	public async getOrCreatePlayer(guildId: string, voiceChannelId: string, textChannelId: string): Promise<Player> {
		return (
			container.audio.getPlayer(guildId) ||
			(await container.audio.createPlayer({
				guildId,
				voiceChannelId,
				textChannelId,
				selfDeaf: true,
				selfMute: false,
				instaUpdateFiltersFix: true,
				applyVolumeAsFilter: true
			}))
		);
	}

	/**
	 * Connects the player to the voice channel.
	 * Checks Discord permissions before attempting connection.
	 */
	public async connectPlayer(player: Player, context: any): Promise<void> {
		if (player.connected) return;

		// Check if the bot can actually join the voice channel
		const guild = container.client.guilds.cache.get(player.guildId);
		const voiceChannel = guild?.channels.cache.get(player.voiceChannelId!);
		if (!voiceChannel || !voiceChannel.isVoiceBased()) {
			throw new UserError({
				identifier: 'play_channel_not_found',
				message: '🎧 음성 채널을 찾을 수 없어요.',
				context
			});
		}

		const me = guild?.members.me;
		if (me) {
			const permissions = voiceChannel.permissionsFor(me);
			if (!permissions?.has(PermissionsBitField.Flags.Connect)) {
				throw new UserError({
					identifier: 'play_no_connect_permission',
					message: '🔒 봇이 음성 채널에 접속할 권한이 없어요.',
					context
				});
			}
			if (!permissions?.has(PermissionsBitField.Flags.Speak)) {
				throw new UserError({
					identifier: 'play_no_speak_permission',
					message: '🔇 봇이 음성 채널에서 말할 권한이 없어요.',
					context
				});
			}
		}

		try {
			await player.connect();
		} catch (error) {
			container.logger.error(error);
			throw new UserError({
				identifier: 'play_connect_error',
				message: '🛠️ 음성 채널에 접속할 수 없어요.',
				context
			});
		}
	}

	/**
	 * Searches for a track or playlist
	 */
	public async search(
		player: Player,
		query: string,
		platform: SearchPlatform,
		user: { id: string; username: string },
		context: any
	): Promise<SearchResult | UnresolvedSearchResult> {
		const searchRes = await player.search({ query, source: platform }, user);

		if (searchRes.loadType === 'error') {
			throw new UserError({
				identifier: 'play_search_error',
				message: '🛠️  음악 검색 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.',
				context
			});
		}

		if (searchRes.loadType === 'empty') {
			throw new UserError({
				identifier: 'play_search_empty',
				message: '🔎  검색 결과가 없어요. 다른 검색어로 다시 시도해 주세요.',
				context
			});
		}

		return searchRes;
	}

	/**
	 * Handles adding a playlist to the queue, including interactive prompts if a specific track was selected
	 */
	public async handlePlaylistPlay(
		interaction: ChatInputCommandInteraction<'cached'>,
		player: Player,
		searchRes: SearchResult | UnresolvedSearchResult
	): Promise<void> {
		const playlist = searchRes.playlist!;

		if (playlist.selectedTrack) {
			await player.queue.add(playlist.selectedTrack);

			const remainingTracks = searchRes.tracks.filter((track) => track.info.identifier !== playlist.selectedTrack!.info.identifier);
			const remainingTracksCount = remainingTracks.length;

			if (remainingTracksCount > 0) {
				await this.promptRemainingPlaylist(interaction, player, playlist, playlist.selectedTrack, remainingTracks as Track[]);
			} else {
				await interaction.editReply({
					flags: MessageFlags.IsComponentsV2,
					components: [
						view.trackAdded({
							track: playlist.selectedTrack as Track,
							queued: player.queue.current !== null,
							position: player.queue.tracks.length,
							totalDuration: player.queue.tracks.reduce((acc, track) => acc + (track.info.duration ?? 0), 0)
						})
					],
					allowedMentions: { users: [], roles: [] }
				});
			}
		} else {
			await player.queue.add(searchRes.tracks);

			await interaction.editReply({
				flags: MessageFlags.IsComponentsV2,
				components: [
					view.playlistQueued({
						playlist,
						tracks: searchRes.tracks as Track[]
					})
				],
				allowedMentions: { users: [], roles: [] }
			});
		}
	}

	private async promptRemainingPlaylist(
		interaction: ChatInputCommandInteraction<'cached'>,
		player: Player,
		playlist: any,
		selectedTrack: Track,
		remainingTracks: Track[]
	): Promise<void> {
		const askReply = await interaction.editReply({
			flags: MessageFlags.IsComponentsV2,
			components: [
				view.askPlaylistAdd({
					playlist,
					selectedTrack,
					remainTracks: remainingTracks,
					player
				})
			],
			allowedMentions: { users: [], roles: [] }
		});

		const trackAdded = view.trackAdded({
			track: selectedTrack,
			queued: player.queue.current !== null,
			position: player.queue.tracks.length,
			totalDuration: player.queue.tracks.reduce((acc, track) => acc + (track.info.duration ?? 0), 0)
		});

		const collector = askReply.createMessageComponentCollector({
			filter: (i) => i.user.id === interaction.user.id && i.customId.includes('playlist_'),
			time: 30000,
			componentType: ComponentType.Button
		});

		const handleEndAction = async () => {
			await interaction
				.editReply({
					flags: MessageFlags.IsComponentsV2,
					components: [trackAdded],
					allowedMentions: { users: [], roles: [] }
				})
				.catch(() => null);
		};

		const handleButtonAction = async (collectorInteraction: ButtonInteraction<'cached'>) => {
			await collectorInteraction.deferUpdate();
			if (!player.connected) return;
			collector.off('collect', handleButtonAction);
			collector.off('end', handleEndAction);

			if (collectorInteraction.customId === 'playlist_add_remaining') {
				await player.queue.add(remainingTracks);

				await collectorInteraction.editReply({
					flags: MessageFlags.IsComponentsV2,
					components: [
						view.playlistQueued({
							playlist,
							tracks: remainingTracks
						})
					],
					allowedMentions: { users: [], roles: [] }
				});
			} else if (collectorInteraction.customId === 'playlist_skip_remaining') {
				await collectorInteraction.editReply({
					flags: MessageFlags.IsComponentsV2,
					components: [trackAdded],
					allowedMentions: { users: [], roles: [] }
				});
			}
		};

		collector.once('collect', handleButtonAction);
		collector.once('end', handleEndAction);
	}

	/**
	 * Handles adding a single track or search result to the queue
	 */
	public async handleTrackPlay(
		interaction: ChatInputCommandInteraction<'cached'>,
		player: Player,
		searchRes: SearchResult | UnresolvedSearchResult
	): Promise<void> {
		await player.queue.add(searchRes.tracks[0]);
		await interaction.editReply({
			flags: MessageFlags.IsComponentsV2,
			components: [
				view.trackAdded({
					track: searchRes.tracks[0] as Track,
					queued: player.queue.current !== null,
					position: player.queue.tracks.length,
					totalDuration: player.queue.tracks.reduce((acc, track) => acc + (track.info.duration ?? 0), 0)
				})
			],
			allowedMentions: { users: [], roles: [] }
		});
	}

	/**
	 * Starts playback if the player is not currently playing
	 */
	public async ensurePlayback(player: Player): Promise<void> {
		if (!player.playing) {
			await player.play(player.paused ? { paused: false } : undefined);
		}
	}

	/**
	 * Handles skip logic, previously in SkipCommand
	 */
	public async handleSkip(context: SkipContext, force: boolean, to: number): Promise<void> {
		if (force || to) {
			await this.checkDJRole(context);
			if (to) {
				await this.handleSkipTo(context, to);
				return;
			} else if (this.isQueueEmpty(context)) {
				await this.handleEmptyQueue(context);
				return;
			} else {
				await this.handleForceSkip(context);
				return;
			}
		}

		if (this.isQueueEmpty(context)) {
			await this.handleEmptyQueue(context);
			return;
		}

		if (this.isTrackRequestedByUser(context.currentTrack, context.interaction.user.id)) {
			await this.handleUserRequestedTrack(context);
			return;
		}

		if (this.isTrackRequestedByBot(context.currentTrack)) {
			await this.handleRelatedTrackSkip(context);
			return;
		}

		if (this.isUserAlone(context)) {
			await this.handleAloneSkip(context);
			return;
		}

		await this.handleVoteSkip(context);
	}

	private isQueueEmpty(context: SkipContext): boolean {
		return context.queue.tracks.length <= 0;
	}

	private isTrackRequestedByUser(track: Track, userId: string): boolean {
		return typeof track.requester !== 'string' && (track.requester as APIUser).id === userId;
	}

	private isTrackRequestedByBot(track: Track): boolean {
		return typeof track.requester !== 'string' && (track.requester as APIUser).id === container.client.user?.id;
	}

	private isUserAlone(context: SkipContext): boolean {
		return Math.ceil(context.voiceChannelMembers.size / 2) <= 1;
	}

	private async handleEmptyQueue(context: SkipContext): Promise<void> {
		const { currentTrack, interaction, player } = context;

		if (this.isTrackRequestedByBot(currentTrack)) {
			await player.skip(0, false);
			await interaction.reply({
				content: '추천 곡 건너뛰기 테스트'
			});
		} else {
			throw new UserError({
				identifier: 'skip_no_more_tracks',
				message: '🔍 건너뛸 노래가 없어요.',
				context: {
					...context,
					ephemeral: true
				}
			});
		}
	}

	private async handleUserRequestedTrack(context: SkipContext): Promise<void> {
		const { player, currentTrack, interaction } = context;

		await player.skip();
		await interaction.reply({
			components: [
				skipView.trackSkipped({
					track: currentTrack,
					requester: interaction.user
				})
			],
			flags: [MessageFlags.IsComponentsV2]
		});
	}

	private async handleRelatedTrackSkip(context: SkipContext): Promise<void> {
		const { player, currentTrack, interaction } = context;

		await player.skip();
		await interaction.reply({
			components: [skipView.trackRelatedSkipped({ track: currentTrack })],
			flags: [MessageFlags.IsComponentsV2]
		});
	}

	private async handleAloneSkip(context: SkipContext): Promise<void> {
		const { player, currentTrack, interaction } = context;

		await player.skip();
		await interaction.reply({
			components: [
				skipView.trackSkipped({
					track: currentTrack,
					requester: interaction.user
				})
			],
			flags: [MessageFlags.IsComponentsV2]
		});
	}

	private async handleVoteSkip(context: SkipContext): Promise<void> {
		const voteSkip = new VoteSkip({
			player: context.player,
			currentTrack: context.currentTrack,
			nextTrack: context.queue.tracks[0] as Track,
			voiceChannelMembers: context.voiceChannelMembers,
			interaction: context.interaction
		});

		await voteSkip.execute();
	}

	private async checkDJRole(context: SkipContext): Promise<boolean> {
		const { interaction } = context;
		const hasPermission = await container.guildService.hasDJRole(interaction.guildId, interaction.member);

		if (!hasPermission) {
			throw new UserError({
				identifier: 'forceskip_no_permission',
				message: '❌ 곡을 강제로 건너뛰려면 DJ 역할이나 관리자 권한이 필요해요.'
			});
		}

		return true;
	}

	private async handleForceSkip(context: SkipContext): Promise<void> {
		const { player, currentTrack, interaction } = context;

		await player.skip();
		await interaction.reply({
			components: [
				skipView.trackSkipped({
					track: currentTrack,
					requester: interaction.user
				})
			],
			flags: [MessageFlags.IsComponentsV2]
		});
	}

	private async handleSkipTo(context: SkipContext, to: number): Promise<void> {
		const { player, interaction } = context;
		if (to > player.queue.tracks.length) {
			throw new UserError({
				identifier: 'skipto_invalid_index',
				message: '🎵 건너뛸 곡이 대기열에 존재하지 않아요.'
			});
		}

		const track = player.queue.tracks[to - 1] as Track;

		await player.skip(to);
		await interaction.reply({
			components: [
				skipView.trackSkippedTo({
					track,
					to
				})
			],
			flags: [MessageFlags.IsComponentsV2]
		});
	}
}
