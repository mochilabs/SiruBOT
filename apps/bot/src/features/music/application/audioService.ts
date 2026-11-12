import { Player, type LavalinkManager, SearchPlatform, Track, SearchResult, UnresolvedSearchResult, UnresolvedTrack } from 'lavalink-client';
import * as Sentry from '@sentry/node';
import { Client, PermissionsBitField } from 'discord.js';
import { emoji } from '@sirubot/utils';
import { AppError } from '../../../lib/appError.ts';
import type { AppLogger } from '../../../lib/appLogger.ts';
import type { GuildService } from '../../../services/guildService.ts';
import { MUSIC_SEARCH_MESSAGES, type PlaySearchOutcome } from './play.ts';
import { isRelatedTrack, removeStaleRelatedTracks } from '../lavalink/autoPlayRelated.ts';
import { cancelPendingInvalidate, notifyQueueMutated } from '../lavalink/queue/queueWrapper.ts';
import { sendOverride } from '../lavalink/handlers/mixerHandlers.ts';
import type { CustomPlayer } from '../lavalink/player/customPlayer.ts';
import type { MixerService } from './mixerService.ts';

export interface AudioServiceDeps {
	logger: AppLogger;
	guildService: GuildService;
	/** audio는 setupAudio 뒤에 생겨서 호출 시점에 읽어요 */
	getAudio: () => LavalinkManager<CustomPlayer>;
	/** client는 로그인 뒤에 준비돼서 호출 시점에 읽어요 */
	getClient: () => Client;
	/** mixerService는 audioService 뒤에 만들어지고 서로 얽혀 있어서 호출 시점에 읽어요 */
	getMixerService: () => MixerService;
}

type SearchedTrack = Track | UnresolvedTrack;
type SearchedPlaylist = NonNullable<SearchResult['playlist']>;

/**
 * 검색 응답을 유스케이스용 결과로 바꾸고, 검색 오류·결과 없음은 AppError로 던져요.
 * 플랫폼 쪽 조회 실패는 유저 메시지와 별개로 Sentry에 남겨요 (F-23).
 */
function toSearchOutcome(
	searchRes: SearchResult | UnresolvedSearchResult,
	context: { query: string; platform: SearchPlatform; guildId?: string }
): PlaySearchOutcome<SearchedTrack, SearchedPlaylist> {
	if (searchRes.loadType === 'error') {
		Sentry.captureException(new Error(`search loadType error (${context.platform}): ${context.query}`), {
			tags: { layer: 'player_search', ...(context.guildId ? { guild_id: context.guildId } : {}) }
		});
		throw new AppError('unavailable', MUSIC_SEARCH_MESSAGES.error(), { ephemeral: false });
	}
	if (searchRes.loadType === 'empty') throw new AppError('not_found', MUSIC_SEARCH_MESSAGES.empty());
	return {
		loadType: searchRes.loadType as PlaySearchOutcome<SearchedTrack, SearchedPlaylist>['loadType'],
		tracks: searchRes.tracks as SearchedTrack[],
		playlist: searchRes.playlist as SearchedPlaylist | null
	};
}

/**
 * 플레이어·검색·접속·대기열 같은 재생 메커니즘을 맡는 서비스예요.
 * 누가 어느 채널에 넣을지 정하는 것은 `application/play.ts`가, 응답 문구와 선택 메뉴는 `discord/utils/playFeedback.ts`가 맡아요.
 */
export class AudioService {
	public constructor(private readonly deps: AudioServiceDeps) {}

	/** 플레이어가 있으면 그대로 돌려줘요. `pinText`면 그 플레이어의 텍스트 채널도 `textChannelId`로 맞춰요. */
	public async getOrCreatePlayer(
		guildId: string,
		voiceChannelId: string,
		textChannelId: string | null,
		options: { pinText?: boolean } = {}
	): Promise<Player> {
		const audio = this.deps.getAudio();
		const existing = audio.getPlayer(guildId);
		if (existing) {
			if (options.pinText && textChannelId) existing.textChannelId = textChannelId;
			return existing;
		}
		return audio.createPlayer({
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
		});
	}

	/**
	 * Connects the player to the voice channel.
	 * Checks Discord permissions before attempting connection.
	 */
	public async connectPlayer(player: Player): Promise<void> {
		if (player.connected) return;

		// Check if the bot can actually join the voice channel
		const guild = this.deps.getClient().guilds.cache.get(player.guildId);
		const voiceChannelId = player.voiceChannelId;
		if (!voiceChannelId) throw new AppError('not_found', `${emoji('error')} 음성 채널 정보를 찾을 수 없어요.`);
		const voiceChannel = guild?.channels.cache.get(voiceChannelId);
		if (!voiceChannel || !voiceChannel.isVoiceBased()) throw new AppError('not_found', `${emoji('error')} 음성 채널을 찾을 수 없어요.`);

		const me = guild?.members.me;
		if (me) {
			const permissions = voiceChannel.permissionsFor(me);
			if (!permissions?.has(PermissionsBitField.Flags.Connect)) {
				throw new AppError('forbidden', `${emoji('error')} 봇이 음성 채널에 접속할 권한이 없어요.`);
			}
			if (!permissions?.has(PermissionsBitField.Flags.Speak)) {
				throw new AppError('forbidden', `${emoji('error')} 봇이 음성 채널에서 말할 권한이 없어요.`);
			}
		}

		try {
			await player.connect();
		} catch (error) {
			if (error instanceof AppError) throw error;
			// Sapphire 로거는 오류 객체도 그대로 받아서 AppLogger 타입에만 맞춰요
			this.deps.logger.error(error as never);
			// 인프라 실패는 사용자 메시지와 별개로 추적 가능해야 해요 — 원인을 Sentry로 남겨요.
			Sentry.captureException(error, {
				tags: { layer: 'player_connect', guild_id: String(player.guildId) }
			});
			throw new AppError('unavailable', `${emoji('error')} 음성 채널에 접속할 수 없어요.`, { cause: error, ephemeral: false });
		}
	}

	/** 플레이어로 검색해요. 검색 오류·결과 없음은 AppError로 던져요. */
	public async search(
		player: Player,
		query: string,
		platform: SearchPlatform,
		requester: { id: string; username: string }
	): Promise<PlaySearchOutcome<SearchedTrack, SearchedPlaylist>> {
		const searchRes = await player.search({ query, source: platform }, requester);
		return toSearchOutcome(searchRes, { query, platform, guildId: String(player.guildId) });
	}

	/** 플레이어 없이 연결된 노드에서 검색해요 (웹 미리보기처럼 플레이어를 만들면 안 되는 곳에서 써요). */
	public async searchWithoutPlayer(
		query: string,
		platform: SearchPlatform,
		requester: { id: string; username: string }
	): Promise<PlaySearchOutcome<SearchedTrack, SearchedPlaylist>> {
		const node = this.findConnectedNode();
		if (!node) throw new AppError('unavailable', MUSIC_SEARCH_MESSAGES.noNode(), { ephemeral: true });
		const searchRes = await node.search({ query, source: platform }, requester);
		return toSearchOutcome(searchRes, { query, platform });
	}

	private findConnectedNode() {
		for (const node of this.deps.getAudio().nodeManager.nodes.values()) {
			if (node.connected) return node;
		}
		return null;
	}

	public async ensurePlayback(player: Player): Promise<void> {
		if (player.playing) return;
		// 클라 playing 플래그는 서버 주도 전이(크로스페이드) 뒤에 false로 굳을 수 있다. 이미 서버가 곡을
		// 재생 중인데 인자 없는 play()를 보내면 현재 곡이 0초로 되감긴다 — 서버가 큐의 현재 곡을 재생 중일 때만 보정만 한다.
		// 서버에 이전 곡이 남아 있으면 보정하지 않고 play()로 큐의 현재 곡을 시작해야 새 곡이 막히지 않는다.
		const serverPlayer = await player.node.fetchPlayer(String(player.guildId)).catch(() => null);
		const queued = player.queue.current?.encoded;
		if (
			serverPlayer &&
			!('status' in serverPlayer) &&
			serverPlayer.track &&
			!serverPlayer.paused &&
			queued &&
			serverPlayer.track.encoded === queued
		) {
			player.playing = true;
			return;
		}
		// mixer 필터는 play op보다 먼저 도착해야 트랙 시작 시의 필터 체인에 포함된다.
		await this.deps.getMixerService().primeForPlay(player);
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
		if (player.transitionState) {
			player.transitionState.confirmedNowPlaying = previousTrack as Track;
		}
		notifyQueueMutated(player, { invalidate: false, bumpEpoch: true, force: true });
		cancelPendingInvalidate(player);
		void player.queue?.utils?.save?.()?.catch(() => null);
		await this.deps.getMixerService().primeForPlay(player);
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
	 * 정지 공용 흐름 — queueEnd 종료 안내를 억제하고 mixer 슬롯·오버레이를 STOP 오버라이드로 정리한 뒤 재생을 끊는다.
	 * (/정지 커맨드와 컨트롤러 stop 버튼이 공유)
	 */
	public async stopPlayback(player: CustomPlayer): Promise<void> {
		player.transitionState.stopByCommand = true;
		if (Array.isArray(player.queue?.tracks)) {
			player.queue.tracks.splice(0, player.queue.tracks.length);
		}
		player.queue.current = null;
		notifyQueueMutated(player, { invalidate: false, bumpEpoch: true, force: true });
		cancelPendingInvalidate(player);
		await sendOverride(player, 'STOP', null).catch(() => null);
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
		const overlapTrackId = this.deps.getMixerService().getOverlapTrackIdentifier(String(player.guildId));
		const firstIsRelated =
			isRelatedTrack(firstBeforeAdd) ||
			isRelatedTrack(consumedTrack) ||
			(overlapTrackId !== null && firstBeforeAdd?.info?.identifier === overlapTrackId && isRelatedTrack(firstBeforeAdd));
		const inCrossfadeTransition =
			this.deps.getMixerService().isOverlapActive(String(player.guildId)) || customPlayer.transitionState?.preloadConsumedAt != null;
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
				player.queue.current = nextTrack as Track;
				if (customPlayer.transitionState) {
					customPlayer.transitionState.preloadConsumedAt = null;
					customPlayer.transitionState.serverConsumedTrack = null;
					customPlayer.transitionState.confirmedNowPlaying = nextTrack as Track;
				}
				notifyQueueMutated(customPlayer, { invalidate: false, bumpEpoch: true, force: true });
				cancelPendingInvalidate(customPlayer);
				await this.deps.getMixerService().primeForPlay(player);
				try {
					await sendOverride(customPlayer, 'PLAY_NOW', (nextTrack as Track).encoded ?? null);
				} catch {
					await player.play({ clientTrack: nextTrack as Track, paused: false });
				}
			}
		} else if (!wasIdle) {
			this.preloadAfterQueueChange(player);
		}
		return { wasIdle };
	}

	public async isControllerEnabled(guildId: string): Promise<boolean> {
		try {
			const guild = await this.deps.guildService.getGuild(guildId);
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
		void this.deps
			.getMixerService()
			.preloadUpcoming(player)
			.catch((error) => {
				this.deps.logger.warn(`[mixer] preload after queue change failed (guild ${player.guildId}): ${error}`);
			});
	}
}
