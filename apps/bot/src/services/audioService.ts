import { container, UserError } from '@sapphire/framework';
import { Player, SearchPlatform, Track, SearchResult, UnresolvedSearchResult, UnresolvedTrack } from 'lavalink-client';
import * as Sentry from '@sentry/node';
import { ButtonInteraction, ChatInputCommandInteraction, ComponentType, MessageFlags, PermissionsBitField } from 'discord.js';
import { isRelatedTrack, removeStaleRelatedTracks } from '../modules/audio/lavalink/autoPlayRelated.ts';
import { cancelPendingInvalidate, notifyQueueMutated } from '../modules/audio/lavalink/queue/queueWrapper.ts';
import { sendOverride } from '../modules/audio/lavalink/handlers/mixerHandlers.ts';
import type { CustomPlayer } from '../modules/audio/lavalink/player/customPlayer.ts';
import * as view from '../modules/audio/view/play.ts';

interface CommandErrorContext extends Record<string, unknown> {
	interaction?: ChatInputCommandInteraction<'cached'> | ButtonInteraction<'cached'> | ChatInputCommandInteraction;
	player?: Player;
	ephemeral?: boolean;
}

export class AudioService {
	public async getOrCreatePlayer(guildId: string, voiceChannelId: string, textChannelId: string | null): Promise<Player> {
		return (
			container.audio.getPlayer(guildId) ||
			(await container.audio.createPlayer({
				guildId,
				voiceChannelId,
				textChannelId: textChannelId ?? undefined,
				selfDeaf: true,
				selfMute: false,
				instaUpdateFiltersFix: true,
				// volume을 filters로 보내면(부분 filters op) 서버의 필터 상태 전체를 덮어써
				// mixer 플러그인 키가 지워진다. playerOptions.volume은 필터와 무관하므로
				// 이쪽을 쓴다.
				applyVolumeAsFilter: false
			}))
		);
	}

	/**
	 * Connects the player to the voice channel.
	 * Checks Discord permissions before attempting connection.
	 */
	public async connectPlayer(player: Player, context: CommandErrorContext): Promise<void> {
		if (player.connected) return;

		// Check if the bot can actually join the voice channel
		const guild = container.client.guilds.cache.get(player.guildId);
		const voiceChannelId = player.voiceChannelId;
		if (!voiceChannelId) {
			throw new UserError({
				identifier: 'play_voice_channel_not_found',
				message: '🎧 음성 채널 정보를 찾을 수 없어요.',
				context
			});
		}
		const voiceChannel = guild?.channels.cache.get(voiceChannelId);
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
			// 인프라 실패는 사용자 메시지(UserError)와 별개로 추적 가능해야 해요 — 원인을 Sentry로 남겨요.
			Sentry.captureException(error, {
				tags: { layer: 'player_connect', guild_id: String(player.guildId) }
			});
			throw new UserError({
				identifier: 'play_connect_error',
				message: '🛠️ 음성 채널에 접속할 수 없어요.',
				context
			});
		}
	}

	public async search(
		player: Player,
		query: string,
		platform: SearchPlatform,
		user: { id: string; username: string },
		context: CommandErrorContext
	): Promise<SearchResult | UnresolvedSearchResult> {
		const searchRes = await player.search({ query, source: platform }, user);

		if (searchRes.loadType === 'error') {
			// 플랫폼 쪽 조회 실패 — 유저 메시지는 그대로, 인프라 원인은 Sentry로 (F-23)
			Sentry.captureException(new Error(`search loadType error (${platform}): ${query}`), {
				tags: { layer: 'player_search', guild_id: String(player.guildId) }
			});
			throw new UserError({
				identifier: 'play_search_error',
				message: '🛠️ 음악 검색 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.',
				context
			});
		}

		if (searchRes.loadType === 'empty') {
			throw new UserError({
				identifier: 'play_search_empty',
				message: '🔎 검색 결과가 없어요. 다른 검색어로 다시 시도해 주세요.',
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
		const playlist = searchRes.playlist;
		if (!playlist) {
			await interaction.editReply({
				content: '🛠️ 플레이리스트 정보를 불러올 수 없어요.',
				flags: MessageFlags.IsComponentsV2
			});
			return;
		}

		if (playlist.selectedTrack) {
			const { wasIdle } = await this.enqueueTrack(player, playlist.selectedTrack);

			const remainingTracks = searchRes.tracks.filter((track) => track.info.identifier !== playlist.selectedTrack!.info.identifier);
			const remainingTracksCount = remainingTracks.length;

			if (remainingTracksCount > 0) {
				await this.promptRemainingPlaylist(interaction, player, playlist, playlist.selectedTrack, remainingTracks as Track[]);
			} else if (wasIdle && (await this.isControllerEnabled(player.guildId))) {
				// 단일곡 + idle → 컨트롤러가 뒤따라오지만 누가 시작했는지는 남긴다
				await interaction
					.editReply({
						flags: MessageFlags.IsComponentsV2,
						components: [view.playStarted({ track: playlist.selectedTrack as Track, userId: interaction.user.id })],
						allowedMentions: { users: [], roles: [] }
					})
					.catch((error) => container.logger.warn(`[audio] playStarted edit failed (guild ${player.guildId}): ${error}`));
			} else {
				await interaction.editReply({
					flags: MessageFlags.IsComponentsV2,
					components: [view.trackAdded(view.trackAddedProps(player, playlist.selectedTrack as Track))],
					allowedMentions: { users: [], roles: [] }
				});
			}
		} else {
			await this.enqueueTrack(player, searchRes.tracks);

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
		playlist: NonNullable<SearchResult['playlist']>,
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

		const trackAdded = view.trackAdded(view.trackAddedProps(player, selectedTrack));

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
				.catch((error) => container.logger.warn(`[audio] trackAdded edit failed (guild ${player.guildId}): ${error}`));
		};

		const handleButtonAction = async (collectorInteraction: ButtonInteraction<'cached'>) => {
			await collectorInteraction.deferUpdate();
			if (!player.connected) return;
			collector.off('collect', handleButtonAction);
			collector.off('end', handleEndAction);

			if (collectorInteraction.customId === 'playlist_add_remaining') {
				await this.enqueueTrack(player, remainingTracks);

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
	 * Handles adding a single track or search result to the queue.
	 * 플레이어가 idle 상태(곧바로 재생 시작 → 컨트롤러가 뒤따라 옴)이고
	 * 컨트롤러가 켜져 있으면 trackAdded 메시지를 생략하고 컨트롤러만 남긴다.
	 * (defer된 interaction은 deleteReply로 정리 → '/재생 추가 + 컨트롤러' 2연타 방지)
	 */
	public async handleTrackPlay(
		interaction: ChatInputCommandInteraction<'cached'>,
		player: Player,
		searchRes: SearchResult | UnresolvedSearchResult
	): Promise<void> {
		const { wasIdle } = await this.enqueueTrack(player, searchRes.tracks[0]);

		if (wasIdle && (await this.isControllerEnabled(player.guildId))) {
			// 컨트롤러가 뒤따라 오지만, 누가 재생을 시작했는지는 채팅에도 남긴다.
			await interaction
				.editReply({
					flags: MessageFlags.IsComponentsV2,
					components: [view.playStarted({ track: searchRes.tracks[0] as Track, userId: interaction.user.id })],
					allowedMentions: { users: [], roles: [] }
				})
				.catch((error) => container.logger.warn(`[audio] playStarted edit failed (guild ${player.guildId}): ${error}`));
			return;
		}

		await interaction.editReply({
			flags: MessageFlags.IsComponentsV2,
			components: [view.trackAdded(view.trackAddedProps(player, searchRes.tracks[0] as Track))],
			allowedMentions: { users: [], roles: [] }
		});
	}

	public async ensurePlayback(player: Player): Promise<void> {
		if (player.playing) return;
		// mixer 필터는 play op보다 먼저 도착해야 트랙 시작 시의 필터 체인에 포함된다.
		await container.mixerService.primeForPlay(player);
		await player.play(player.paused ? { paused: false } : undefined);
	}

	/**
	 * 이전곡 재생 공용 흐름 — 현재곡을 큐 선두로 되돌리고 mixer 슬롯을 재준비한 뒤
	 * 마지막 previous 항목을 시작한다. (/이전곡 커맨드와 컨트롤러 prev 버튼이 공유)
	 */
	public async playPrevious(player: CustomPlayer): Promise<Track | UnresolvedTrack> {
		const previousTrack = player.queue.previous[player.queue.previous.length - 1];
		if (player.queue.current) {
			player.queue.tracks.unshift(player.queue.current);
		}
		player.queue.previous.pop();
		player.queue.current = previousTrack as Track;
		notifyQueueMutated(player, { invalidate: false });
		cancelPendingInvalidate(player);
		await container.mixerService.clearNext(player).catch(() => null);
		await container.mixerService.primeForPlay(player);
		try {
			await sendOverride(player, 'PLAY_NOW', previousTrack.encoded ?? null);
		} catch (error: unknown) {
			// mixer 미설치/테스트 스텁 등 오버라이드 실패 시 라이브러리 play로 폴백한다.
			await player.play({ clientTrack: previousTrack }).catch(() => {
				throw error;
			});
		}
		return previousTrack;
	}

	/**
	 * 정지 공용 흐름 — queueEnd 종료 안내를 억제하고 mixer 슬롯을 정리한 뒤 재생을 끊는다.
	 * (/정지 커맨드와 컨트롤러 stop 버튼이 공유)
	 */
	public async stopPlayback(player: CustomPlayer): Promise<void> {
		player.transitionState.stopByCommand = true;
		// 정지는 플레이어가 곧 사라지므로 슬롯 정리 실패가 치명적이진 않다 — 다만
		// 무기록으로 남기지 않도록 재시도 후 로그로 남긴다 (P2).
		await container.mixerService.clearNextLenient(player);
		await player.stopPlaying().catch(() => null);
		await player.disconnect().catch(() => null);
	}

	/**
	 * 곡 1개(또는 플레이리스트 전체)를 대기열에 넣는 공용 흐름 — 즉시 재생/선택 피드백 등 호출 지점이
	 * 서로 달라도 추가·선예열 추천곡 제거·슬롯 재예열은 한 곳에서만 처리한다.
	 * 반환: wasIdle(시작 전에 아무것도 재생 중이 아니었는지 → 피드백 문구 선택용)
	 */
	public async enqueueTrack(player: Player, track: Track | UnresolvedTrack | (Track | UnresolvedTrack)[]): Promise<{ wasIdle: boolean }> {
		const wasIdle = player.queue.current === null && !player.playing;
		const customPlayer = player as CustomPlayer;
		// 지금 크로스페이드로 들어오고 있는 곡이 추천곡인지 판단하려고 추가 전 큐 상태를 잰다.
		const firstBeforeAdd = player.queue.tracks[0];
		const consumedTrack = customPlayer.transitionState?.serverConsumedTrack ?? null;
		const overlapTrackId = container.mixerService.getOverlapTrackIdentifier(String(player.guildId));
		const firstIsRelated =
			isRelatedTrack(firstBeforeAdd) ||
			isRelatedTrack(consumedTrack) ||
			(overlapTrackId !== null && firstBeforeAdd?.info?.identifier === overlapTrackId && isRelatedTrack(firstBeforeAdd));
		const inCrossfadeTransition =
			container.mixerService.isOverlapActive(String(player.guildId)) || customPlayer.transitionState?.preloadConsumedAt != null;
		const shouldInterruptRelatedCrossfade = !wasIdle && firstIsRelated && inCrossfadeTransition;

		await player.queue.add(track);
		await removeStaleRelatedTracks(player);

		if (shouldInterruptRelatedCrossfade && player.queue.tracks.length > 0) {
			// 추천곡 크로스페이드를 끊고 유저 곡으로 즉시 교체한다 — 이전 브랜치 없이
			// 관련곡이 3~10초 재생된 뒤 유저 곡이 이어지는 더듬는 경험을 막는다.
			const nextTrack = (await player.queue.splice(0, 1)) as Track | UnresolvedTrack | null;
			if (nextTrack) {
				if (player.queue.current && !isRelatedTrack(player.queue.current) && Array.isArray(player.queue.previous)) {
					player.queue.previous.unshift(player.queue.current);
					while (player.queue.previous.length > 25) player.queue.previous.pop();
				}
				if (customPlayer.transitionState) {
					customPlayer.transitionState.preloadConsumedAt = null;
					customPlayer.transitionState.serverConsumedTrack = null;
				}
				await container.mixerService.clearNext(player).catch(() => null);
				await container.mixerService.primeForPlay(player);
				await player.play({ clientTrack: nextTrack as Track, paused: false });
				if (player.queue.tracks.length > 0) this.preloadAfterQueueChange(player);
			}
		} else if (!wasIdle) {
			this.preloadAfterQueueChange(player);
		}
		return { wasIdle };
	}

	public async isControllerEnabled(guildId: string): Promise<boolean> {
		try {
			const guild = await container.guildService.getGuild(guildId);
			return guild?.enableController !== false;
		} catch {
			return false;
		}
	}

	/**
	 * 재생/일시정지 중 대기열 변경 직후 다음 첫 곡을 서버 슬롯에 다시 예열한다.
	 * 일시정지 중에는 lavalink-client가 player.playing을 false로 두므로 paused도 함께 본다 —
	 * 선예열 추천곡이 제거돼 head가 바뀌었는데 슬롯을 갱신하지 않으면 content end에
	 * 큐에 없는 추천곡이 재생된다. 완전히 정지한 상태에서는 시작을 play()가 담당하므로 건너뛴다.
	 */
	private preloadAfterQueueChange(player: Player): void {
		if (!player.queue.current || (!player.playing && !player.paused)) return;
		void container.mixerService.preloadUpcoming(player).catch((error) => {
			container.logger.warn(`[mixer] preload after queue change failed (guild ${player.guildId}): ${error}`);
		});
	}
}
