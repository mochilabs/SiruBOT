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
import type { LavalinkDeps } from '../lavalink/deps.ts';
import { isSameEncodedTrack } from '../lavalink/trackEncoded.ts';
import { destroyStoppedPlayer, type CustomPlayer } from '../lavalink/player/customPlayer.ts';
import type { MixerService } from './mixerService.ts';

export interface AudioServiceDeps {
	logger: AppLogger;
	guildService: GuildService;
	getAudio: () => LavalinkManager<CustomPlayer>;
	getClient: () => Client;
	getMixerService: () => MixerService;
	getDefaultTextChannel?: (guildId: string) => Promise<string | null>;
	lavalink: LavalinkDeps;
}

type SearchedTrack = Track | UnresolvedTrack;
type SearchedPlaylist = NonNullable<SearchResult['playlist']>;

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

export class AudioService {
	public constructor(private readonly deps: AudioServiceDeps) {}

	public async getOrCreatePlayer(
		guildId: string,
		voiceChannelId: string,
		textChannelId: string | null,
		options: { pinText?: boolean } = {}
	): Promise<Player> {
		const audio = this.deps.getAudio();
		const existing = audio.getPlayer(guildId);
		const defaultChannel = await this.deps.getDefaultTextChannel?.(guildId).catch(() => null);
		if (defaultChannel) {
			textChannelId = defaultChannel;
			options = { ...options, pinText: true };
		}
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
			// filters op로 volume을 보내면 서버의 mixer 필터 키가 덮어써지므로 playerOptions로 보낸다.
			applyVolumeAsFilter: false
		});
	}

	public async connectPlayer(player: Player): Promise<void> {
		if (player.connected) return;

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
			this.deps.logger.error(error as never);
			Sentry.captureException(error, {
				tags: { layer: 'player_connect', guild_id: String(player.guildId) }
			});
			throw new AppError('unavailable', `${emoji('error')} 음성 채널에 접속할 수 없어요.`, { cause: error, ephemeral: false });
		}
	}

	public async search(
		player: Player,
		query: string,
		platform: SearchPlatform,
		requester: { id: string; username: string }
	): Promise<PlaySearchOutcome<SearchedTrack, SearchedPlaylist>> {
		const searchRes = await player.search({ query, source: platform }, requester);
		return toSearchOutcome(searchRes, { query, platform, guildId: String(player.guildId) });
	}

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
		// 명시적 재생 시작 시 stopByCommand를 해제하고, 서버가 이미 큐의 현재 곡을 재생 중이면 playing 플래그만 보정한다.
		(player as CustomPlayer).transitionState.stopByCommand = false;
		const serverPlayer = await player.node.fetchPlayer(String(player.guildId)).catch(() => null);
		const queued = player.queue.current?.encoded;
		if (
			serverPlayer &&
			!('status' in serverPlayer) &&
			serverPlayer.track &&
			!serverPlayer.paused &&
			queued &&
			isSameEncodedTrack(serverPlayer.track.encoded, queued)
		) {
			player.playing = true;
			return;
		}
		// mixer 필터는 play op보다 먼저 도착해야 트랙 시작 시의 필터 체인에 포함된다.
		await this.deps.getMixerService().primeForPlay(player);
		await player.play(player.paused ? { paused: false } : undefined);
	}

	public async playPrevious(player: CustomPlayer): Promise<Track | UnresolvedTrack> {
		const previousTrack = player.queue.previous[0];
		if (player.queue.current) {
			player.queue.tracks.unshift(player.queue.current);
		}
		player.queue.previous.shift();
		player.queue.current = previousTrack as Track;
		if (player.transitionState) {
			player.transitionState.confirmedNowPlaying = previousTrack as Track;
		}
		notifyQueueMutated(this.deps.lavalink, player, { invalidate: false, bumpEpoch: true, force: true });
		cancelPendingInvalidate(player);
		void player.queue?.utils?.save?.()?.catch(() => null);
		await this.deps.getMixerService().primeForPlay(player);
		try {
			await sendOverride(this.deps.lavalink, player, 'PLAY_NOW', previousTrack.encoded ?? null);
		} catch (error: unknown) {
			await player.play({ clientTrack: previousTrack }).catch(() => {
				throw error;
			});
		}
		return previousTrack;
	}

	public async stopPlayback(player: CustomPlayer): Promise<void> {
		player.transitionState.stopByCommand = true;
		if (Array.isArray(player.queue?.tracks)) {
			player.queue.tracks.splice(0, player.queue.tracks.length);
		}
		player.queue.current = null;
		notifyQueueMutated(this.deps.lavalink, player, { invalidate: false, bumpEpoch: true, force: true });
		cancelPendingInvalidate(player);
		await sendOverride(this.deps.lavalink, player, 'STOP', null).catch(() => null);
		await destroyStoppedPlayer(player);
	}

	public async enqueueTrack(player: Player, track: Track | UnresolvedTrack | (Track | UnresolvedTrack)[]): Promise<{ wasIdle: boolean }> {
		const wasIdle = player.queue.current === null && !player.playing;
		const customPlayer = player as CustomPlayer;
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
		await removeStaleRelatedTracks(this.deps.lavalink, player);

		if (shouldInterruptRelatedCrossfade && player.queue.tracks.length > 0) {
			// 추천곡 크로스페이드를 끊고 유저 곡으로 즉시 교체한다.
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
				notifyQueueMutated(this.deps.lavalink, customPlayer, { invalidate: false, bumpEpoch: true, force: true });
				cancelPendingInvalidate(customPlayer);
				await this.deps.getMixerService().primeForPlay(player);
				try {
					await sendOverride(this.deps.lavalink, customPlayer, 'PLAY_NOW', (nextTrack as Track).encoded ?? null);
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

	/** 일시정지 중에도 playing이 false이므로 paused를 함께 확인해 다음 곡 슬롯을 재예열한다. */
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
