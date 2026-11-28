import type { LavalinkDeps } from '../deps.ts';
import { LavalinkManager, Track, TrackStartEvent } from 'lavalink-client';
import { ILogObj, Logger } from 'tslog';
import { resolveYouTubeVideoId } from '@sirubot/utils';
import { queueRelatedUpfront } from '../autoPlayRelated.ts';
import { isTtsClip } from '../requester.ts';
import { fetchYouTubeChapters } from '../../../../services/dataApiClient.ts';
import { formatRecordError } from '../../application/trackService.ts';
import { publishPlayerState } from '../playerStatePublisher.ts';
import { CustomPlayer } from '../player/customPlayer.ts';
import { isSameEncodedTrack, normalizeTrackEncoded, syncQueueToNowPlaying } from './playbackWatchdog.ts';
import type { TrackTransitionHost } from './trackHandler.ts';

export class TrackStartOrchestrator {
	constructor(
		private readonly host: TrackTransitionHost,
		private readonly logger: Logger<ILogObj>,
		private readonly lavalinkManager: LavalinkManager<CustomPlayer>,
		private readonly deps: LavalinkDeps
	) {}

	public async handleTrackStart(player: CustomPlayer, track: Track | null, payload: TrackStartEvent) {
		const preloadedIdentifier = this.deps.mixerService.takePreloadedIdentifier(player.guildId);
		const startedTrack = this.resolveStartedTrack(player, track, payload, preloadedIdentifier);
		if (startedTrack && !isTtsClip(startedTrack)) player.relatedTrackHistory.remember(startedTrack);
		syncQueueToNowPlaying(player, startedTrack);
		// Server-initiated transitions bypass player.play(), so reset lavalink-client's position baseline.
		const previousStarted = player.transitionState.lastStartedEncoded;
		const startedEncoded = typeof startedTrack?.encoded === 'string' ? normalizeTrackEncoded(startedTrack.encoded) : null;
		if (startedEncoded && !isSameEncodedTrack(previousStarted, startedEncoded)) {
			player.lastPosition = 0;
			player.lastPositionChange = Date.now();
		}
		player.transitionState.confirmedNowPlaying = startedTrack;
		player.transitionState.serverConsumedTrack = null;
		if (player.mixerRuntime) {
			player.mixerRuntime.transitionSeq++;
		}
		player.consecutiveErrors = 0;
		this.deps.playbackReporter.reportPlaybackEvent(player.guildId, 'track_start', startedTrack);
		publishPlayerState(this.deps, player, { immediate: true });
		player.transitionState.stopByCommand = false;
		player.transitionState.preloadConsumedAt = null;
		this.host.setLastStarted(player, startedTrack);
		this.host.clearAdvancePending(player.guildId);
		this.host.clearWatchdog(player.guildId);
		this.loadChapters(player, startedTrack);
		this.deps.sponsorBlockService.startTrack(player, startedTrack);
		void this.deps.mixerService.supportsIncomingStart?.(player).catch(() => null);
		const startedKey = startedTrack
			? ((startedTrack.encoded ? normalizeTrackEncoded(startedTrack.encoded) : null) ??
				startedTrack.info?.identifier ??
				startedTrack.info?.uri ??
				null)
			: null;
		if (startedTrack && !startedTrack.info.isStream && !isTtsClip(startedTrack) && startedKey !== player.transitionState.lastRecordedKey) {
			player.transitionState.lastRecordedKey = startedKey;
			this.logger.trace(`Ensuring track and increasing plays: ${startedTrack.info.title} by ${startedTrack.info.author}`);
			void this.deps.trackService.recordPlay(player.guildId, startedTrack).catch((error) => {
				this.logger.error(`Failed to record track history: ${formatRecordError(error)}`);
			});
		}

		const mixerWiring = this.runMixerWiring(player, startedTrack);
		if (!isTtsClip(startedTrack)) {
			await this.deps.playerNotifier.onTrackStart(player);
			// Scrub leftover solo TTS clips before draining them to overlay announcements.
			this.deps.chatTtsService.scrubTtsClips(player, null);
			void this.deps.chatTtsService
				.drainSoloQueueToAnnounce(player)
				.catch((error) => this.logger.warn(`[chatTts] solo queue drain failed (guild ${player.guildId}): ${error}`));
		}
		await mixerWiring;
	}

	private async runMixerWiring(player: CustomPlayer, startedTrack: Track | null): Promise<void> {
		try {
			await this.deps.mixerService.ensureMixerFilter(player).catch((error) => {
				this.logger.warn(`[mixer] enableFilter failed for guild ${player.guildId}, will retry: ${error}`);
			});
			const preloaded = await this.deps.mixerService.preloadUpcoming(player).catch((error) => {
				this.logger.warn(`[mixer] preload failed (guild ${player.guildId}): ${error}`);
				return false;
			});
			if (!preloaded && startedTrack && player.queue.tracks.length === 0) {
				await queueRelatedUpfront(this.deps, player, startedTrack).catch((error) => {
					this.logger.warn(`[mixer] related pre-add failed (guild ${player.guildId}): ${error}`);
				});
			}
		} catch (error) {
			this.logger.warn(`[mixer] trackStart wiring failed (guild ${player.guildId}): ${error}`);
			this.deps.mixerService.markUnmanaged(player.guildId);
		}
	}

	public async continueAfterTtsClip(player: CustomPlayer, track: Track | null): Promise<void> {
		this.deps.chatTtsService.scrubTtsClips(player, track);
		if (player.transitionState.stopByCommand) {
			this.deps.chatTtsService.clearSoloQueue(player.guildId);
			return;
		}
		if (this.deps.mixerService.consumePreloaded(player.guildId)) {
			player.transitionState.preloadConsumedAt = Date.now();
			const preheated = player.queue.tracks[0] ?? null;
			if (preheated) player.transitionState.serverConsumedTrack = preheated as Track;
			if (!this.host.isTransitionAlreadyStarted(player, track)) this.host.armWatchdog(player);
			return;
		}
		if (this.host.hasWatchdog(player.guildId)) return;

		const current = player.queue.current as Track | null;
		if (current && !isTtsClip(current)) {
			await this.host.startClientOwnedTrack(player);
			return;
		}
		if (current) {
			return;
		}
		const seeded = await this.deps.chatTtsService.seedNextSoloClip(player);
		if (!seeded) {
			await this.quietEndTts(player);
			return;
		}
		const next = player.queue.tracks.shift();
		if (next) player.queue.current = next as (typeof player.queue)['current'];
		if (player.queue.current) {
			await this.host.startClientOwnedTrack(player);
			return;
		}
		await this.quietEndTts(player);
	}

	public async quietEndTts(player: CustomPlayer): Promise<void> {
		player.transitionState.lastStartedEncoded = null;
		player.transitionState.preloadConsumedAt = null;
		player.transitionState.confirmedNowPlaying = null;
		player.transitionState.serverConsumedTrack = null;
		player.playing = false;
		publishPlayerState(this.deps, player);
		await this.deps.chatTtsService.keepAliveForTts(player);
	}

	/** Prefer client-fetched track metadata when the server payload has the same identifier (e.g. stale file-cache metadata). */
	public resolveStartedTrack(
		player: CustomPlayer,
		track: Track | null,
		payload: TrackStartEvent,
		preloadedIdentifier: string | null
	): Track | null {
		const payloadEncoded = payload.track?.encoded;
		const currentEncoded = (track as { encoded?: unknown } | null)?.encoded;
		if (!payloadEncoded || isSameEncodedTrack(payloadEncoded, currentEncoded)) return track;

		const payloadIdentifier = payload.track?.info?.identifier;
		const currentIdentifier = (track as { info?: { identifier?: unknown } } | null)?.info?.identifier;
		if (typeof payloadIdentifier === 'string' && payloadIdentifier.length > 0 && track && currentIdentifier === payloadIdentifier) {
			return track;
		}
		if (typeof payloadIdentifier === 'string' && payloadIdentifier.length > 0 && Array.isArray(player.queue.tracks)) {
			const queued = player.queue.tracks.find(
				(t: unknown) =>
					(t as { encoded?: unknown })?.encoded != null &&
					(t as { info?: { identifier?: unknown } })?.info?.identifier === payloadIdentifier
			);
			if (queued) {
				this.logger.debug(`[transition] trackStart resolved by identifier (guild ${player.guildId}): using queued track for display`);
				return queued as Track;
			}
			if (preloadedIdentifier && preloadedIdentifier !== payloadIdentifier) {
				this.logger.warn(
					`[transition] unexpected track started (guild ${player.guildId}): preloaded=${preloadedIdentifier}, started=${payloadIdentifier}`
				);
			}
		}
		if (typeof payloadIdentifier === 'string' && payloadIdentifier.length > 0 && Array.isArray(player.queue.previous)) {
			const prev = player.queue.previous.find((t) => t?.info?.identifier === payloadIdentifier);
			if (prev) {
				return prev as Track;
			}
		}
		const consumed = player.transitionState?.serverConsumedTrack;
		const consumedIdentifier = (consumed as { info?: { identifier?: unknown } } | null)?.info?.identifier;
		if (consumed && typeof payloadIdentifier === 'string' && consumedIdentifier === payloadIdentifier) {
			this.logger.debug(`[transition] trackStart resolved from the server-consumed preheat (guild ${player.guildId})`);
			return consumed;
		}
		return this.lavalinkManager.utils.buildTrack(payload.track, undefined);
	}

	private loadChapters(player: CustomPlayer, track: Track | null): void {
		const videoId = resolveYouTubeVideoId(track);
		if (player.chaptersTrackIdentifier !== videoId) {
			player.chapters = [];
			player.chaptersTrackIdentifier = videoId;
		}
		if (!videoId || player.chapters.length > 0) return;

		const duration = track?.info?.duration ?? 0;
		void fetchYouTubeChapters(videoId, duration)
			.then((chapters) => {
				if (player.chaptersTrackIdentifier !== videoId || chapters.length === 0) return;
				player.chapters = chapters;
				this.deps.playerNotifier.updateController(player);
			})
			.catch((error) => this.logger.debug(`[chapters] failed for ${videoId}: ${error}`));
	}
}
