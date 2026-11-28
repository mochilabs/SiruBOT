import type { LavalinkDeps } from '../deps.ts';
import { MessageFlags } from 'discord.js';
import { notice } from '../../../../lib/notice.ts';
import { LavalinkManager, Track, TrackEndEvent, TrackExceptionEvent, TrackStuckEvent, UnresolvedTrack } from 'lavalink-client';
import { ILogObj, Logger } from 'tslog';
import { emoji } from '@sirubot/utils';
import { getInFlightRelatedFetch } from '../autoPlayRelated.ts';
import { isTtsClip } from '../requester.ts';
import { clearPlayerStateTracker, publishPlayerEnded, publishPlayerState } from '../playerStatePublisher.ts';
import { CustomPlayer, destroyStoppedPlayer, transitionConfirmTimeoutMs } from '../player/customPlayer.ts';
import { isSameEncodedTrack, isSameTrack, normalizeTrackEncoded, syncPlayingFlagFromProbe, syncQueueToNowPlaying } from './playbackWatchdog.ts';
import type { TrackTransitionHost } from './trackHandler.ts';
import { clearMixerRuntime, handleMixerTrackEnd, sendOverride } from './mixerHandlers.ts';
import { getConfig } from '../../../../lib/config.ts';
import { cancelPendingInvalidate, getTargetNextTrack } from '../queue/queueWrapper.ts';
const maxConsecutiveErrors = (): number => getConfig().playback.maxConsecutiveErrors;

function extractExceptionReason(payload: TrackExceptionEvent): string | null {
	const raw = payload.exception?.message?.trim() || payload.exception?.cause?.trim() || payload.error?.trim() || '';
	return raw ? raw.slice(0, 200) : null;
}

export class QueueAdvancer {
	private readonly clientAdvancePending = new Map<string, { token: number; timer: ReturnType<typeof setTimeout> }>();
	private advanceTokenSeq = 0;
	private get confirmTimeoutMs(): number {
		return transitionConfirmTimeoutMs();
	}

	constructor(
		private readonly host: TrackTransitionHost,
		private readonly logger: Logger<ILogObj>,
		private readonly lavalinkManager: LavalinkManager<CustomPlayer>,
		private readonly deps: LavalinkDeps
	) {}

	public handleTrackEnd(player: CustomPlayer, track: Track | null, payload: TrackEndEvent) {
		const ended = (payload.track?.encoded ? payload.track : track) as Track | null;
		this.logger.info(
			`Track ended: ${ended?.info?.title ?? track?.info.title} by ${ended?.info?.author ?? track?.info.author} (reason: ${payload.reason})`
		);
		this.deps.playbackReporter.reportPlaybackEvent(player.guildId, 'track_end', ended, { reason: payload.reason });

		if (this.deps.chatTtsService.isTtsEnded(player, ended)) {
			if (payload.reason === 'replaced') {
				this.deps.chatTtsService.scrubTtsClips(player, ended);
				return;
			}
			void this.host
				.continueAfterTtsClip(player, ended)
				.catch((error) => this.logger.error(`Failed to continue after TTS clip (guild ${player.guildId}): ${error}`));
			return;
		}

		if (this.host.isTransitionAlreadyStarted(player, ended)) {
			this.logger.debug(`[transition] trackEnd ignored: transition already started (guild ${player.guildId})`);
			return;
		}

		void handleMixerTrackEnd(this.deps, player, payload);
	}

	public async handleTrackStuck(player: CustomPlayer, track: Track | UnresolvedTrack | null, _payload: TrackStuckEvent) {
		await this.handleTrackFailure(player, track, 'stuck');
	}

	public async handleTrackError(player: CustomPlayer, track: Track | UnresolvedTrack | null, payload: TrackExceptionEvent) {
		await this.handleTrackFailure(player, track, 'error', extractExceptionReason(payload));
	}

	private async handleTrackFailure(
		player: CustomPlayer,
		track: Track | UnresolvedTrack | null,
		kind: 'stuck' | 'error',
		reason: string | null = null
	) {
		// Solo TTS playback has an empty music queue; mixerService.skip would send STOP.
		if (isTtsClip(track)) {
			this.logger.warn(`[chatTts] TTS clip ${kind} silently skipped (guild ${player.guildId})${reason ? ` (${reason})` : ''}`);
			this.clearAdvancePending(player.guildId);
			await this.host.continueAfterTtsClip(player, track as Track | null).catch((error) => {
				this.logger.warn(`[chatTts] clip continue failed (guild ${player.guildId}): ${error}`);
			});
			return;
		}
		this.clearAdvancePending(player.guildId);
		player.consecutiveErrors++;
		this.logger.warn(
			`Track ${kind} (${player.consecutiveErrors}/${maxConsecutiveErrors()}): ${track?.info.title} by ${track?.info.author}${reason ? ` (${reason})` : ''}`
		);
		this.deps.playbackReporter.reportPlaybackEvent(player.guildId, kind === 'stuck' ? 'track_stuck' : 'track_error', track, {
			...(reason ? { reason } : {}),
			consecutiveErrors: player.consecutiveErrors
		});

		if (player.consecutiveErrors >= maxConsecutiveErrors()) {
			this.logger.warn(`Max consecutive errors reached for guild ${player.guildId}, aborting playback`);
			this.deps.playbackReporter.reportPlaybackEvent(player.guildId, 'playback_abort', track, {
				reason: 'max_consecutive_errors',
				consecutiveErrors: player.consecutiveErrors
			});
			await this.sendFailureNotification(
				player,
				`🚫 연속 재생 오류가 ${maxConsecutiveErrors()}회 발생했어요. 음성 서버에 문제가 있을 수 있어요. 재생을 중단했어요.`
			);
			player.transitionState.stopByCommand = true;
			this.deps.mixerService.markUnmanaged(player.guildId);
			this.host.clearWatchdog(player.guildId);
			cancelPendingInvalidate(player);
			await sendOverride(this.deps, player, 'STOP', null).catch(() => null);
			await destroyStoppedPlayer(player);
			return;
		}

		if (this.deps.mixerService.consumePreloaded(player.guildId)) {
			player.transitionState.preloadConsumedAt = Date.now();
			const preheated = player.queue.tracks[0] ?? null;
			if (preheated) player.transitionState.serverConsumedTrack = preheated as Track;
			if (!this.host.isTransitionAlreadyStarted(player, track)) {
				this.host.armWatchdog(player);
			}
			return;
		}
		if (this.host.hasWatchdog(player.guildId)) return;

		if (player.queue.tracks.length > 0 || getTargetNextTrack(player) !== null) {
			await this.deps.mixerService.skip(player).catch((error) => {
				this.logger.warn(`[mixer] error-skip failed (guild ${player.guildId}), deferring to watchdog: ${error}`);
				this.host.armWatchdog(player);
			});
		} else {
			await this.sendFailureNotification(player, `${emoji('error')} **${track?.info.title ?? '알 수 없는 곡'}** 재생 중 오류가 발생했어요.`);
			player.transitionState.stopByCommand = true;
			cancelPendingInvalidate(player);
			await sendOverride(this.deps, player, 'STOP', null).catch(() => null);
			await player.stopPlaying();
		}
	}

	public async handleQueueEnd(
		player: CustomPlayer,
		track: Track | UnresolvedTrack | null,
		_payload: TrackEndEvent | TrackStuckEvent | TrackExceptionEvent
	) {
		this.logger.info(`Queue ended for guild: ${player.guildId}`);
		this.deps.playbackReporter.reportPlaybackEvent(player.guildId, 'queue_end', track);
		publishPlayerState(this.deps, player);

		if (this.deps.chatTtsService.isTtsEnded(player, track)) {
			if (player.transitionState.stopByCommand) {
				this.deps.chatTtsService.clearSoloQueue(player.guildId);
				return;
			}
			const seeded = await this.deps.chatTtsService.seedNextSoloClip(player);
			if (!seeded) {
				await this.host.quietEndTts(player);
				return;
			}
		}

		if (this.deps.mixerService.isPreloaded(player.guildId) || this.deps.mixerService.isOverlapActive(player.guildId)) {
			this.logger.debug(`[mixer] queueEnd deferred: server owns transition (guild ${player.guildId})`);
			this.host.armWatchdog(player);
			return;
		}

		if (player.playing) {
			this.logger.debug(`[mixer] queueEnd deferred: still playing (guild ${player.guildId})`);
			this.host.armWatchdog(player);
			return;
		}

		const ended = (_payload?.track?.encoded ? _payload.track : track) as Track | null;
		const lastStarted = player.transitionState.lastStartedEncoded;
		const endedEncoded = (ended as { encoded?: unknown } | null)?.encoded;
		if (typeof lastStarted === 'string' && typeof endedEncoded === 'string' && !isSameEncodedTrack(endedEncoded, lastStarted)) {
			this.logger.debug(`[mixer] queueEnd deferred: stale event for ${endedEncoded} (guild ${player.guildId})`);
			if (!this.host.isTransitionAlreadyStarted(player, ended)) {
				this.host.armWatchdog(player);
			}
			return;
		}

		const consumedAt = player.transitionState.preloadConsumedAt;
		if (consumedAt && Date.now() - consumedAt < this.confirmTimeoutMs) {
			this.logger.debug(`[mixer] queueEnd deferred: preloaded slot consumed just now (guild ${player.guildId})`);
			this.host.armWatchdog(player);
			return;
		}

		const inFlightRelated = getInFlightRelatedFetch(this.deps, player.guildId);
		if (inFlightRelated) {
			const addedTrack = await inFlightRelated.catch(() => null);
			if (addedTrack && !player.playing && (player.queue.current || player.queue.tracks.length > 0)) {
				await this.host
					.startClientOwnedTrack(player)
					.catch((error) => this.logger.error(`Failed to start pre-added autoplay track: ${error}`));
				return;
			}
			if (addedTrack && (player.queue.current || player.playing)) return;
		}

		if (this.clientAdvancePending.has(player.guildId)) return;
		if (player.queue.current && !player.playing) {
			await this.host.startClientOwnedTrack(player).catch((error) => this.logger.error(`Failed to start autoplay track: ${error}`));
			return;
		}

		if (!player.playing && player.queue.tracks.length > 0) {
			if (!player.queue.current) {
				const next = player.queue.tracks.shift();
				if (next) player.queue.current = next as (typeof player.queue)['current'];
			}
			if (player.queue.current) {
				await this.host
					.startClientOwnedTrack(player)
					.catch((error) => this.logger.error(`Failed to start queued track after queueEnd: ${error}`));
				return;
			}
		}

		// If the server still holds a track (stale queueEnd after trackStart emptied client queue), restore client state.
		const serverPlayer = player.transitionState.stopByCommand ? null : await player.node.fetchPlayer(String(player.guildId)).catch(() => null);
		if (serverPlayer && !('status' in serverPlayer) && serverPlayer.track) {
			this.logger.warn(`[mixer] queueEnd deferred: server still has an active track (guild ${player.guildId}), restoring client state`);
			const serverTrack = this.lavalinkManager.utils.buildTrack(serverPlayer.track, undefined);
			player.queue.current = serverTrack as (typeof player.queue)['current'];
			player.transitionState.lastStartedEncoded = typeof serverTrack.encoded === 'string' ? normalizeTrackEncoded(serverTrack.encoded) : null;
			if (!serverPlayer.paused) player.playing = true;
			this.host.armWatchdog(player);
			publishPlayerState(this.deps, player);
			await this.deps.playerNotifier.updateController(player);
			return;
		}

		await this.finishQueue(player);
		await this.deps.chatTtsService.keepAliveForTts(player);
	}

	public async finishQueue(player: CustomPlayer): Promise<void> {
		this.host.clearWatchdog(player.guildId);
		player.transitionState.lastStartedEncoded = null;
		player.transitionState.preloadConsumedAt = null;
		player.transitionState.confirmedNowPlaying = null;
		player.transitionState.serverConsumedTrack = null;
		publishPlayerEnded(this.deps, player);
		await this.deps.playerNotifier.deleteController(player);

		if (!player.transitionState.stopByCommand) {
			await this.sendNotification(player, `${emoji('inbox_tray')} 대기열의 모든 곡을 재생했어요.`);
		}
	}

	private async sendFailureNotification(player: CustomPlayer, message: string) {
		const withNotice = await this.deps.incidentNotice.appendTo(message).catch(() => message);
		await this.sendNotification(player, withNotice);
	}

	private async sendNotification(player: CustomPlayer, message: string) {
		if (!player.textChannelId) return;
		try {
			const channel = this.deps.client.channels.cache.get(player.textChannelId);
			if (channel?.isSendable()) {
				await channel.send({
					components: [notice(message)],
					flags: [MessageFlags.IsComponentsV2]
				});
			}
		} catch (error) {
			this.logger.error(`Failed to send notification: ${error}`);
		}
	}

	public async handlePlayerDestroy(player: CustomPlayer): Promise<void> {
		this.deps.mixerService.markUnmanaged(player.guildId);
		this.deps.mixerService.markFiltersStale?.(player.guildId);
		this.deps.chatTtsService.clearGuild(player.guildId);
		this.clearAdvancePending(player.guildId);
		this.host.clearReconcile(player.guildId);
		this.host.clearWatchdog(player.guildId);
		player.transitionState.lastStartedEncoded = null;
		player.transitionState.confirmedNowPlaying = null;
		player.transitionState.serverConsumedTrack = null;
		clearPlayerStateTracker(this.deps, player.guildId);
		await this.deps.mixerService.clearNext(player).catch(() => null);
		clearMixerRuntime(player);
	}

	public async startClientOwnedTrack(player: CustomPlayer): Promise<void> {
		if (player.transitionState.stopByCommand) return;
		if (this.clientAdvancePending.has(player.guildId)) return;
		const token = this.setAdvancePending(player.guildId);
		// Probe server first; play({ noReplace: true }) silently no-ops if a track is already playing.
		const probe = await this.host.fetchServerTrack(player);
		syncPlayingFlagFromProbe(player, probe);
		if (probe.known ? probe.track !== null : true) {
			if (this.clientAdvancePending.get(player.guildId)?.token === token) this.clearAdvancePending(player.guildId);
			this.deps.mixerService.markUnmanaged(player.guildId);
			const serverTrack = probe.known ? probe.track : null;
			if (serverTrack && isSameTrack(serverTrack, player.queue.current)) {
				this.host.setLastStarted(player, player.queue.current);
			} else if (serverTrack) {
				this.logger.warn(`[transition] client advance lost the race (guild ${player.guildId}), following the server track`);
				syncQueueToNowPlaying(player, serverTrack);
				this.host.setLastStarted(player, serverTrack);
			}
			this.host.armWatchdog(player);
			this.deps.playerNotifier.updateController(player);
			return;
		}
		try {
			await this.deps.mixerService.clearNext(player).catch(() => null);
			// Send mixer filter before play() so Lavaplayer attaches it to the track's filter chain.
			await this.deps.mixerService.primeForPlay(player);
			await player.play({ noReplace: true });
			this.host.armWatchdogUnlessStarted(player);
		} catch (error) {
			if (this.clientAdvancePending.get(player.guildId)?.token === token) {
				this.clearAdvancePending(player.guildId);
			}
			this.host.armWatchdogUnlessStarted(player);
			throw error;
		}
	}

	public setAdvancePending(guildId: string): number {
		this.clearAdvancePending(guildId);
		const token = ++this.advanceTokenSeq;
		const timer = setTimeout(() => {
			const entry = this.clientAdvancePending.get(guildId);
			if (entry?.token === token) this.clientAdvancePending.delete(guildId);
		}, this.confirmTimeoutMs);
		this.clientAdvancePending.set(guildId, { token, timer });
		return token;
	}

	public clearAdvancePending(guildId: string): void {
		const entry = this.clientAdvancePending.get(guildId);
		if (entry) clearTimeout(entry.timer);
		this.clientAdvancePending.delete(guildId);
	}

	public cleanup() {
		for (const entry of this.clientAdvancePending.values()) clearTimeout(entry.timer);
		this.clientAdvancePending.clear();
	}
}
