import { randomUUID } from 'node:crypto';
import { Track, TrackEndEvent } from 'lavalink-client';
import { needsUpcomingTrack } from '@sirubot/utils/mixerTransition';
import { sleep } from '@sirubot/utils/time';
import { CustomPlayer } from '../player/customPlayer.ts';
import type { LavalinkDeps } from '../deps.ts';
import { cancelPendingInvalidate, getTargetNextTrack, getTrackUid, notifyQueueMutated, type QueueMutationOptions } from '../queue/queueWrapper.ts';
import { isTtsClip } from '../requester.ts';
import { isSameEncodedTrack, isSameTrack, normalizeTrackEncoded } from './playbackWatchdog.ts';
import { MixerRequestError, type ArmRequestOptions } from '../mixerProtocol.ts';
import { formatRecordError } from '../../application/trackService.ts';
import * as guildMixer from '../../../../services/guildSettings/mixer.ts';
import { isOverrideInFlight, sendOverride } from './mixerOverride.ts';

export {
	clearMixerRuntime,
	handleMixerOverridden,
	hardResync,
	isOverrideInFlight,
	sendOverride,
	type MixerOverriddenEventPayload
} from './mixerOverride.ts';

const TRACK_END_CONFIRM_MS = 200;

const rt = (p: CustomPlayer) => p.mixerRuntime;

export interface MixerNeedNextEventPayload {
	remainingMs: number;
	currentTrackEncoded: string;
}

export interface MixerAdvancedEventPayload {
	epoch: number;
	encodedTrack: string;
	handoffType: string;
	handoffId?: string;
}

function recordTrackPlayIfNeeded(deps: LavalinkDeps, player: CustomPlayer, track: Track | null): void {
	if (!track || track.info?.isStream || isTtsClip(track)) return;
	player.relatedTrackHistory.remember(track);
	const key = (track.encoded ? normalizeTrackEncoded(track.encoded) : null) ?? track.info?.identifier ?? track.info?.uri ?? null;
	if (!key) return;
	if (player.transitionState && player.transitionState.lastRecordedKey === key && player.repeatMode !== 'track') {
		return;
	}
	if (player.transitionState) {
		player.transitionState.lastRecordedKey = key;
	}
	const trackSvc = deps.trackService;
	if (!trackSvc?.recordPlay) return;
	void trackSvc.recordPlay(player.guildId, track).catch((error) => {
		deps.logger?.error?.(`Failed to record track history: ${formatRecordError(error)}`);
	});
}

export function commitLocal(deps: LavalinkDeps, player: CustomPlayer, track: Track, opts: QueueMutationOptions = {}): void {
	const mutationOpts: QueueMutationOptions = { invalidate: false, bumpEpoch: false, ...opts };
	const tracks = player.queue.tracks;
	const headTrack = tracks[0] as Track | undefined;
	const shouldSpliceHead = headTrack !== undefined && (headTrack === track || isSameTrack(headTrack, track));

	if (player.repeatMode === 'track' && !shouldSpliceHead) {
		player.queue.current = track;
		if (player.transitionState) {
			player.transitionState.confirmedNowPlaying = track;
		}
		recordTrackPlayIfNeeded(deps, player, track);
		notifyQueueMutated(deps, player, mutationOpts);
		void player.queue?.utils?.save?.()?.catch(() => null);
		deps.playerNotifier.updateController(player);
		return;
	}

	if (player.repeatMode === 'queue' && !shouldSpliceHead && tracks.length === 0) {
		player.queue.current = track;
		if (player.transitionState) {
			player.transitionState.confirmedNowPlaying = track;
		}
		recordTrackPlayIfNeeded(deps, player, track);
		notifyQueueMutated(deps, player, mutationOpts);
		void player.queue?.utils?.save?.()?.catch(() => null);
		deps.playerNotifier.updateController(player);
		return;
	}

	const [now] = tracks.splice(0, 1);
	if (player.queue.current) {
		const prevCurrent = player.queue.current;
		player.queue.previous.unshift(prevCurrent);
		while (player.queue.previous.length > 25) {
			player.queue.previous.pop();
		}
		if (player.repeatMode === 'queue') {
			tracks.push(prevCurrent);
		}
	}
	const nextCurrent = (now as Track | undefined) ?? track ?? null;
	player.queue.current = nextCurrent;
	if (player.transitionState) {
		player.transitionState.confirmedNowPlaying = nextCurrent;
	}
	recordTrackPlayIfNeeded(deps, player, nextCurrent);
	notifyQueueMutated(deps, player, mutationOpts);
	void player.queue?.utils?.save?.()?.catch(() => null);
	deps.playerNotifier.updateController(player);
}

function getTrackAlbum(track: Track | null | undefined): string | null {
	if (!track) return null;
	if (track.userData && typeof track.userData === 'object' && 'album' in track.userData && typeof track.userData.album === 'string') {
		return track.userData.album;
	}
	if ('pluginInfo' in track && track.pluginInfo && typeof track.pluginInfo === 'object') {
		if ('albumName' in track.pluginInfo && typeof track.pluginInfo.albumName === 'string') {
			return track.pluginInfo.albumName;
		}
	}
	return null;
}

export function shouldPreserveTransition(current: Track | null | undefined, next: Track | null | undefined): boolean {
	if (!current || !next) return false;
	if (
		next.userData &&
		typeof next.userData === 'object' &&
		'preserveTransition' in next.userData &&
		(next.userData.preserveTransition === 'true' || next.userData.preserveTransition === 1)
	) {
		return true;
	}
	const currentAlbum = getTrackAlbum(current);
	const nextAlbum = getTrackAlbum(next);
	if (currentAlbum && nextAlbum && currentAlbum === nextAlbum) {
		return true;
	}
	return false;
}

async function armOptions(deps: LavalinkDeps, player: CustomPlayer, target: Track | null): Promise<ArmRequestOptions> {
	const options: ArmRequestOptions = {
		epoch: player.currentEpoch,
		encodedTrack: target?.encoded ? normalizeTrackEncoded(target.encoded) : null,
		isEmpty: !target,
		preserveTransition: target ? shouldPreserveTransition(player.queue.current, target) : undefined
	};
	if (!target) return options;
	const outgoingEnd = options.preserveTransition ? undefined : deps.sponsorBlockService.outgoingEndPositionMs(player);
	try {
		const start = await Promise.race([deps.sponsorBlockService.incomingStartPositionMs(player, target), sleep(2_000).then(() => undefined)]);
		if (start && (await deps.mixerService.supportsIncomingStart(player))) options.startPositionMs = start;
	} catch (error) {
		deps.logger.debug(`[SponsorBlock] incoming start unavailable for ${player.guildId}: ${String(error)}`);
	}
	try {
		if (outgoingEnd && outgoingEnd > (player.position ?? 0) + 500 && (await deps.mixerService.supportsOutgoingEnd(player)))
			options.outgoingEndPositionMs = outgoingEnd;
	} catch (error) {
		deps.logger.debug(`[SponsorBlock] outgoing end unavailable for ${player.guildId}: ${String(error)}`);
	}
	return options;
}

export async function handleMixerNeedNext(deps: LavalinkDeps, player: CustomPlayer, _event: MixerNeedNextEventPayload): Promise<void> {
	// Music slots during solo TTS playback are owned by continueAfterTtsClip.
	if (isTtsClip(player.queue?.current)) return;

	const triggerEncoded = player.queue.current?.encoded ?? null;
	const settings = await guildMixer.getMixerSettings(deps.guildService, player.guildId).catch(() => null);
	const shouldArm = settings ? needsUpcomingTrack(settings) : true;

	const stale = () =>
		isTtsClip(player.queue.current) ||
		!player.playing ||
		rt(player).pending.size > 0 ||
		!isSameEncodedTrack(player.queue.current?.encoded ?? null, triggerEncoded);

	if (stale()) return;

	const target = shouldArm ? getTargetNextTrack(player) : null;
	const key = randomUUID();

	try {
		const options = await armOptions(deps, player, target);
		if (stale() || getTrackUid(shouldArm ? getTargetNextTrack(player) : null) !== getTrackUid(target)) return;
		cancelPendingInvalidate(player);
		options.epoch = player.currentEpoch;
		await deps.mixerService.arm(player, options, key);
		player.mixerRuntime.lastTargetUid = getTrackUid(target);
	} catch (error: unknown) {
		if (!(error instanceof MixerRequestError) || error.status !== 409) {
			deps.logger.warn(`[mixer] arm failed on guild ${player.guildId}: ${error instanceof Error ? error.message : String(error)}`);
			return;
		}

		if (typeof error.lastKnownEpoch === 'number') {
			player.currentEpoch = Math.max(player.currentEpoch, error.lastKnownEpoch);
		}
		if (typeof error.v2WindowOpenAt === 'number') {
			const remainingWait = error.v2WindowOpenAt - Date.now() + 50;
			if (remainingWait > 0) await sleep(remainingWait);
		}

		if (stale()) return;

		try {
			const latestTarget = shouldArm ? getTargetNextTrack(player) : null;
			const options = await armOptions(deps, player, latestTarget);
			if (stale() || getTrackUid(shouldArm ? getTargetNextTrack(player) : null) !== getTrackUid(latestTarget)) return;
			cancelPendingInvalidate(player);
			options.epoch = player.currentEpoch;
			await deps.mixerService.arm(player, options);
			player.mixerRuntime.lastTargetUid = getTrackUid(latestTarget);
		} catch (retryError) {
			deps.logger.error(
				`[mixer] arm retry failed on guild ${player.guildId}: ${retryError instanceof Error ? retryError.message : String(retryError)}`
			);
		}
	}
}

export async function handleMixerAdvanced(deps: LavalinkDeps, player: CustomPlayer, event: MixerAdvancedEventPayload): Promise<void> {
	const target = getTargetNextTrack(player);
	const confirmedEncoded = player.transitionState?.confirmedNowPlaying?.encoded ?? player.queue.current?.encoded ?? null;
	const alreadyCurrent =
		isSameEncodedTrack(player.queue.current?.encoded, event.encodedTrack) || isSameEncodedTrack(confirmedEncoded, event.encodedTrack);

	if (event.epoch !== player.currentEpoch) {
		if (alreadyCurrent) {
			player.currentEpoch = Math.max(player.currentEpoch, event.epoch);
			rt(player).transitionSeq++;
			player.mixerRuntime.lastTargetUid = getTrackUid(getTargetNextTrack(player));
			return;
		}
		if (target && isSameEncodedTrack(target.encoded, event.encodedTrack)) {
			// Local epoch bumped before invalidate reached server, but server still advanced to the unchanged head.
			player.currentEpoch = Math.max(player.currentEpoch, event.epoch);
			rt(player).transitionSeq++;
			commitLocal(deps, player, target as Track, { invalidate: false });
			return;
		}
		deps.logger.warn(`[mixer] stale advanced event (got ${event.epoch}, current ${player.currentEpoch}) on guild ${player.guildId}`);
		await recover(deps, player, 'stale', event.encodedTrack);
		return;
	}

	// TrackStartEvent arrived before MixerAdvancedEvent and already shifted target into queue.current.
	if ((!target || !isSameEncodedTrack(target.encoded, event.encodedTrack)) && alreadyCurrent && player.repeatMode !== 'track') {
		rt(player).transitionSeq++;
		player.mixerRuntime.lastTargetUid = getTrackUid(getTargetNextTrack(player));
		return;
	}

	if (!target || !isSameEncodedTrack(target.encoded, event.encodedTrack)) {
		deps.logger.error(`[mixer] desync assert failed: plugin=${event.encodedTrack}, target=${target?.encoded} on guild ${player.guildId}`);
		await recover(deps, player, 'desync', event.encodedTrack);
		return;
	}

	rt(player).transitionSeq++;
	commitLocal(deps, player, target as Track, { invalidate: false });
}

async function recover(deps: LavalinkDeps, player: CustomPlayer, reason: 'stale' | 'desync', serverEncoded?: string): Promise<void> {
	if (isOverrideInFlight(player)) {
		return;
	}

	const head = getTargetNextTrack(player) ?? (player.queue.tracks[0] as Track | undefined);
	if (serverEncoded) {
		const serverTrack = await fetchServerTrackById(player);
		if (serverTrack) {
			if (isSameTrack(serverTrack, player.queue.current) || isSameTrack(serverTrack, player.transitionState?.confirmedNowPlaying)) {
				rt(player).transitionSeq++;
				player.mixerRuntime.lastTargetUid = getTrackUid(getTargetNextTrack(player));
				deps.logger.info(`[mixer] recovery (${reason}) reconciled to current playing track on guild ${player.guildId}`);
				return;
			}
			if (head && (isSameTrack(serverTrack, head) || isSameEncodedTrack(serverTrack.encoded, serverEncoded))) {
				rt(player).transitionSeq++;
				commitLocal(deps, player, head, { invalidate: false, bumpEpoch: false });
				deps.logger.info(`[mixer] recovery (${reason}) reconciled to server head track on guild ${player.guildId}`);
				return;
			}
			if (isSameTrack(serverTrack, { encoded: serverEncoded })) {
				commitLocalIfMatches(deps, player, serverEncoded);
				deps.logger.info(`[mixer] recovery (${reason}) reconciled to server track on guild ${player.guildId}`);
				return;
			}
		}
	}

	if (head) {
		commitLocal(deps, player, head, { invalidate: false, bumpEpoch: false });
		await sendOverride(deps, player, 'PLAY_NOW', head.encoded ?? null, { recovery: true });
	} else {
		player.queue.current = null;
		notifyQueueMutated(deps, player, { invalidate: false, bumpEpoch: false, force: true });
		cancelPendingInvalidate(player);
		void player.queue?.utils?.save?.()?.catch(() => null);
		deps.playerNotifier.updateController(player);
		await sendOverride(deps, player, 'STOP', null, { recovery: true });
	}
	deps.logger.info(`[mixer] recovery (${reason}) executed on guild ${player.guildId}`);
}

async function fetchServerTrackById(player: CustomPlayer): Promise<{ encoded?: string; info?: { identifier?: string } } | null> {
	try {
		const serverPlayer = (await player.node.fetchPlayer(String(player.guildId))) as {
			track?: { encoded?: string; info?: { identifier?: string } };
		} | null;
		if (!serverPlayer || 'status' in serverPlayer || !serverPlayer.track) return null;
		return serverPlayer.track;
	} catch {
		return null;
	}
}

function commitLocalIfMatches(deps: LavalinkDeps, player: CustomPlayer, serverEncoded: string): void {
	const head = getTargetNextTrack(player) ?? (player.queue.tracks[0] as Track | undefined);
	if (head && isSameEncodedTrack(head.encoded, serverEncoded)) {
		rt(player).transitionSeq++;
		commitLocal(deps, player, head, { invalidate: false, bumpEpoch: false });
	}
}

export async function handleMixerTrackEnd(deps: LavalinkDeps, player: CustomPlayer, event: TrackEndEvent): Promise<void> {
	if (event.reason !== 'finished' && event.reason !== 'loadFailed') return;

	const endedTrack = event.track ?? null;
	const ended = endedTrack?.encoded ? normalizeTrackEncoded(endedTrack.encoded) : null;
	const confirmedTrack = player.transitionState?.confirmedNowPlaying ?? null;
	const confirmedOrStarted = confirmedTrack?.encoded ?? player.transitionState?.lastStartedEncoded ?? null;
	const currentTrack = player.queue.current ?? null;
	const currentEncoded = currentTrack?.encoded ?? null;
	const prevTrack = player.queue.previous?.[0] ?? null;

	const matchesEnded = (candidateEncoded: unknown, candidateTrack?: { encoded?: unknown; info?: { identifier?: unknown } } | null) =>
		isSameEncodedTrack(candidateEncoded, ended) || (endedTrack != null && candidateTrack != null && isSameTrack(candidateTrack, endedTrack));

	const preShiftedByLibrary =
		currentEncoded !== null &&
		!matchesEnded(currentEncoded, currentTrack) &&
		(matchesEnded(confirmedOrStarted, confirmedTrack) || matchesEnded(prevTrack?.encoded, prevTrack));
	if (!ended || (!matchesEnded(currentEncoded, currentTrack) && !matchesEnded(confirmedOrStarted, confirmedTrack) && !preShiftedByLibrary)) {
		return;
	}

	if (isOverrideInFlight(player)) {
		return;
	}

	if (TRACK_END_CONFIRM_MS > 0) {
		const seq = rt(player).transitionSeq;
		await sleep(TRACK_END_CONFIRM_MS);
		const afterConfirmedTrack = player.transitionState?.confirmedNowPlaying ?? null;
		const afterConfirmed = afterConfirmedTrack?.encoded ?? player.transitionState?.lastStartedEncoded ?? player.queue.current?.encoded ?? null;
		if (
			seq !== rt(player).transitionSeq ||
			(afterConfirmed !== null && !matchesEnded(afterConfirmed, afterConfirmedTrack ?? player.queue.current) && !preShiftedByLibrary)
		) {
			return;
		}
	}

	await coldStart(deps, player, ended, preShiftedByLibrary);
}

async function coldStart(deps: LavalinkDeps, player: CustomPlayer, ended: string, preShiftedByLibrary: boolean = false): Promise<void> {
	if (player.repeatMode === 'track') {
		await sendOverride(deps, player, 'PLAY_NOW', ended);
		return;
	}

	// lavalink-client's queueTrackEnd may already have shifted the next track into queue.current.
	const next =
		preShiftedByLibrary && player.queue.current && !isSameEncodedTrack(player.queue.current.encoded, ended)
			? (player.queue.current as Track)
			: getTargetNextTrack(player);
	if (!next) {
		player.queue.current = null;
		player.playing = false;
		player.lastPositionChange = null;
		notifyQueueMutated(deps, player, { invalidate: false, bumpEpoch: false, force: true });
		cancelPendingInvalidate(player);
		void player.queue?.utils?.save?.()?.catch(() => null);
		deps.playerNotifier.updateController(player);
		return;
	}

	// Probe server before PLAY_NOW so an in-flight gapless/crossfade transition isn't restarted from 0s.
	const seqBeforeProbe = rt(player).transitionSeq;
	const serverTrack = await fetchServerTrackById(player);
	if (seqBeforeProbe !== rt(player).transitionSeq || isOverrideInFlight(player)) {
		return;
	}
	if (!isSameEncodedTrack(next.encoded, ended) && serverTrack && isSameTrack(serverTrack, next)) {
		if (!isSameEncodedTrack(player.queue.current?.encoded, next.encoded)) {
			commitLocal(deps, player, next, { invalidate: false, bumpEpoch: false });
		} else {
			notifyQueueMutated(deps, player, { invalidate: false, bumpEpoch: false });
			deps.playerNotifier.updateController(player);
		}
		return;
	}

	if (preShiftedByLibrary && player.queue.current === next) {
		if (player.transitionState) {
			player.transitionState.confirmedNowPlaying = next;
		}
		recordTrackPlayIfNeeded(deps, player, next);
		notifyQueueMutated(deps, player, { invalidate: false, bumpEpoch: false });
		deps.playerNotifier.updateController(player);
	} else {
		commitLocal(deps, player, next, { invalidate: false, bumpEpoch: false });
	}
	await sendOverride(deps, player, 'PLAY_NOW', next.encoded ?? null);
}
