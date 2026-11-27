import type { LavalinkDeps } from '../deps.ts';
import { LavalinkManager, Track, UnresolvedTrack } from 'lavalink-client';
import { ILogObj, Logger } from 'tslog';
import * as Sentry from '@sentry/node';
import { CustomPlayer, transitionConfirmTimeoutMs } from '../player/customPlayer.ts';
import type { TrackTransitionHost } from './trackHandler.ts';
import { isSameEncodedTrack, normalizeTrackEncoded } from '../trackEncoded.ts';
import { getTargetNextTrack, getTrackUid, notifyQueueMutated } from '../queue/queueWrapper.ts';

const TRANSITION_RECONCILE_MS = 800;

export type ServerTrackProbe = { known: true; track: Track | null; paused: boolean } | { known: false };

export function syncPlayingFlagFromProbe(player: { playing: boolean }, probe: ServerTrackProbe): void {
	if (probe.known && probe.track) player.playing = !probe.paused;
}

export { isSameEncodedTrack, normalizeTrackEncoded } from '../trackEncoded.ts';

export function isSameTrack(
	a: { encoded?: unknown; info?: { identifier?: unknown } } | null | undefined,
	b: { encoded?: unknown; info?: { identifier?: unknown } } | null | undefined
): boolean {
	if (isSameEncodedTrack(a?.encoded, b?.encoded)) return true;
	const identifierA = a?.info?.identifier;
	const identifierB = b?.info?.identifier;
	return typeof identifierA === 'string' && identifierA.length > 0 && identifierA === identifierB;
}

export function syncQueueToNowPlaying(player: CustomPlayer, track: Track | null): void {
	const queue = player.queue;
	if (!queue || !track) return;
	const encoded = (track as { encoded?: unknown }).encoded;
	if (queue.current && ((queue.current as { encoded?: unknown })?.encoded === encoded || isSameTrack(queue.current, track))) {
		return;
	}
	if (Array.isArray(queue.tracks) && typeof encoded === 'string') {
		const index = queue.tracks.findIndex(
			(t: unknown) =>
				(t as { encoded?: unknown })?.encoded === encoded || isSameTrack(t as { encoded?: unknown; info?: { identifier?: unknown } }, track)
		);
		if (index >= 0) {
			const [now] = queue.tracks.splice(index, 1);
			if (queue.current && (queue.current as { encoded?: unknown })?.encoded !== encoded) {
				if (Array.isArray(queue.previous)) {
					queue.previous.unshift(queue.current);
					while (queue.previous.length > 25) queue.previous.pop();
				}
				if (player.repeatMode === 'queue') {
					queue.tracks.push(queue.current);
				}
			}
			queue.current = now as Track;
			if (player.mixerRuntime) {
				player.mixerRuntime.lastTargetUid = getTrackUid(getTargetNextTrack(player));
			}
			void queue.utils?.save?.()?.catch(() => null);
			return;
		}
	}
	if ((queue.current as { encoded?: unknown })?.encoded !== encoded) {
		if (queue.current && Array.isArray(queue.previous)) {
			queue.previous.unshift(queue.current);
			while (queue.previous.length > 25) queue.previous.pop();
		}
		if (queue.current && player.repeatMode === 'queue' && Array.isArray(queue.tracks)) {
			queue.tracks.push(queue.current);
		}
		queue.current = track as (typeof queue)['current'];
		if (player.mixerRuntime) {
			player.mixerRuntime.lastTargetUid = getTrackUid(getTargetNextTrack(player));
		}
		void queue.utils?.save?.()?.catch(() => null);
	}
}

export class PlaybackWatchdog {
	private readonly watchdogs = new Map<string, ReturnType<typeof setTimeout>>();
	private readonly reconcileTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private get confirmTimeoutMs(): number {
		return transitionConfirmTimeoutMs();
	}

	constructor(
		private readonly host: TrackTransitionHost,
		private readonly logger: Logger<ILogObj>,
		private readonly lavalinkManager: LavalinkManager<CustomPlayer>,
		private readonly deps: LavalinkDeps
	) {}

	public setLastStarted(player: CustomPlayer, track: Track | null): void {
		const rawEncoded = (track as { encoded?: unknown } | null)?.encoded;
		const encoded = typeof rawEncoded === 'string' ? normalizeTrackEncoded(rawEncoded) : null;
		player.transitionState.lastStartedEncoded = encoded;
		if (!track || typeof encoded !== 'string') return;
		const guildId = player.guildId;
		this.clearReconcile(guildId);
		this.reconcileTimers.set(
			guildId,
			setTimeout(() => {
				this.reconcileTimers.delete(guildId);
				void this.reconcileNowPlaying(player, track, encoded).catch((error) =>
					this.logger.warn(`[transition] reconcile failed (guild ${guildId}): ${error}`)
				);
			}, TRANSITION_RECONCILE_MS)
		);
	}

	public async reconcileNowPlaying(player: CustomPlayer, track: Track, encoded: string): Promise<void> {
		if (!isSameEncodedTrack(player.transitionState.lastStartedEncoded, encoded)) return;
		if (player.transitionState.stopByCommand) return;
		const currentEncoded = (player.queue.current as { encoded?: unknown } | null)?.encoded;
		if (isSameEncodedTrack(currentEncoded, encoded) || isSameTrack(player.queue.current, track)) return;

		const probe = await this.fetchServerTrack(player);
		syncPlayingFlagFromProbe(player, probe);
		if (!probe.known) {
			if (!player.playing && player.queue.tracks.length === 0) return;
		} else if (probe.track === null) {
			return;
		} else if (!isSameTrack(probe.track, track)) {
			this.logger.warn(`[transition] client drifted from server (guild ${player.guildId}), following the server track`);
			syncQueueToNowPlaying(player, probe.track);
			this.setLastStarted(player, probe.track);
			this.deps.playerNotifier.updateController(player);
			return;
		}

		this.logger.warn(`[transition] now-playing mismatch after start (guild ${player.guildId}), restoring state`);
		const displaced = player.queue.current;
		player.queue.current = track as (typeof player.queue)['current'];
		if (displaced && !isSameTrack(displaced, track) && Array.isArray(player.queue.tracks)) {
			player.queue.tracks.unshift(displaced as (typeof player.queue.tracks)[number]);
		}
		if (player.mixerRuntime) {
			notifyQueueMutated(this.deps, player, { invalidate: false, bumpEpoch: false });
		}
		void player.queue?.utils?.save?.()?.catch(() => null);
		// Use updateController instead of sendController to avoid racing with trackStart's controller message.
		this.deps.playerNotifier.updateController(player);
	}

	public isTransitionAlreadyStarted(player: CustomPlayer, ended: Track | UnresolvedTrack | null): boolean {
		const endedEncoded = (ended as { encoded?: unknown } | null)?.encoded;
		const lastStarted = player.transitionState.lastStartedEncoded;
		if (typeof endedEncoded !== 'string' || typeof lastStarted !== 'string') return false;
		if (isSameEncodedTrack(endedEncoded, lastStarted)) return false;
		if (player.transitionState.confirmedNowPlaying && isSameTrack(ended, player.transitionState.confirmedNowPlaying)) {
			return false;
		}
		return true;
	}

	public async fetchServerTrack(player: CustomPlayer): Promise<ServerTrackProbe> {
		try {
			const serverPlayer = await player.node.fetchPlayer(String(player.guildId));
			if (!serverPlayer || 'status' in serverPlayer || !serverPlayer.track) return { known: true, track: null, paused: false };
			return {
				known: true,
				track: this.lavalinkManager.utils.buildTrack(serverPlayer.track, undefined),
				paused: Boolean(serverPlayer.paused)
			};
		} catch (error) {
			this.logger.debug(`[mixer] fetchPlayer failed (guild ${player.guildId}): ${error}`);
			return { known: false };
		}
	}

	/** Conservatively treat unknown server state as active so we don't issue a no-op play. */
	private async isServerTrackActive(player: CustomPlayer): Promise<boolean> {
		const probe = await this.fetchServerTrack(player);
		syncPlayingFlagFromProbe(player, probe);
		return probe.known ? probe.track !== null : true;
	}

	public armWatchdog(player: CustomPlayer, serverActiveObserved: number = 0): void {
		const guildId = player.guildId;
		this.clearWatchdog(guildId);
		this.watchdogs.set(
			guildId,
			setTimeout(() => {
				this.watchdogs.delete(guildId);
				void Promise.resolve()
					.then(async () => {
						if (player.transitionState.stopByCommand) return this.host.finishQueue(player);
						// Cap active observations so repeated fetch failures still fall through to recovery.
						if (serverActiveObserved < 4 && (await this.isServerTrackActive(player))) {
							this.armWatchdog(player, serverActiveObserved + 1);
							return;
						}
						this.deps.mixerService.markUnmanaged(guildId);
						if (player.queue.current) {
							if (serverActiveObserved < 4 && (await this.isServerTrackActive(player))) {
								this.armWatchdog(player, serverActiveObserved + 1);
								return;
							}
							return this.deps.mixerService
								.clearNext(player)
								.catch(() => null)
								.then(() => this.deps.mixerService.primeForPlay(player).catch(() => null))
								.then(() => player.play({ noReplace: true }))
								.then(() => this.armWatchdogUnlessStarted(player));
						}
						if (player.queue.tracks.length > 0) {
							// Avoid player.skip() when !playing && !current, which leaves an unhandled play() rejection.
							const next = player.queue.tracks.shift();
							if (next) player.queue.current = next as (typeof player.queue)['current'];
							return this.host.startClientOwnedTrack(player);
						}
						return this.host.finishQueue(player);
					})
					.catch((error) => {
						this.logger.error(`Watchdog recovery failed (guild ${player.guildId}), re-arming watchdog: ${error}`);
						Sentry.withScope((scope) => {
							scope.setTag('handler_context', 'watchdog_recovery');
							scope.setTag('guild_id', player.guildId);
							Sentry.captureException(error);
						});
						this.armWatchdog(player, serverActiveObserved + 1);
					});
			}, this.confirmTimeoutMs)
		);
	}

	public armWatchdogUnlessStarted(player: CustomPlayer): void {
		const currentEncoded = (player.queue.current as { encoded?: unknown } | null)?.encoded;
		const started =
			(typeof currentEncoded === 'string' && isSameEncodedTrack(player.transitionState.lastStartedEncoded, currentEncoded)) ||
			(player.queue.current != null &&
				player.transitionState.confirmedNowPlaying != null &&
				isSameTrack(player.queue.current, player.transitionState.confirmedNowPlaying));
		if (started && player.playing) return;
		this.armWatchdog(player);
	}

	public hasWatchdog(guildId: string): boolean {
		return this.watchdogs.has(guildId);
	}

	public clearReconcile(guildId: string): void {
		const timer = this.reconcileTimers.get(guildId);
		if (timer) {
			clearTimeout(timer);
			this.reconcileTimers.delete(guildId);
		}
	}

	public clearWatchdog(guildId: string): void {
		const timer = this.watchdogs.get(guildId);
		if (timer) {
			clearTimeout(timer);
			this.watchdogs.delete(guildId);
		}
	}

	public cleanup() {
		for (const timer of this.watchdogs.values()) clearTimeout(timer);
		this.watchdogs.clear();
		for (const timer of this.reconcileTimers.values()) clearTimeout(timer);
		this.reconcileTimers.clear();
	}
}
