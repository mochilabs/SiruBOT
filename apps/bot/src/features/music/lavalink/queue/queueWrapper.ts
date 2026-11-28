import { randomUUID } from 'node:crypto';
import { Track, UnresolvedTrack } from 'lavalink-client';
import type { CustomPlayer } from '../player/customPlayer.ts';
import type { LavalinkDeps } from '../deps.ts';
import { isTtsClip } from '../requester.ts';

export function ensureTrackUid(track: Track | UnresolvedTrack): string {
	if (!track.userData) {
		track.userData = {};
	}
	if (!track.userData.uid || typeof track.userData.uid !== 'string') {
		track.userData.uid = randomUUID();
	}
	return track.userData.uid;
}

export function getTrackUid(track: Track | UnresolvedTrack | null | undefined): string | null {
	if (!track) return null;
	if (track.userData?.uid && typeof track.userData.uid === 'string') {
		return track.userData.uid;
	}
	return ensureTrackUid(track);
}

export function getTargetNextTrack(player: CustomPlayer): Track | null {
	// Solo TTS clips are managed by continueAfterTtsClip, not armed as music next-tracks.
	if (isTtsClip(player.queue?.current)) return null;
	if (player.repeatMode === 'track') {
		const candidate = (player.queue?.current as Track | null) ?? null;
		return isTtsClip(candidate) ? null : candidate;
	}
	if (player.repeatMode === 'queue') {
		const first = (player.queue?.tracks?.[0] as Track | null) ?? null;
		if (first && !isTtsClip(first)) return first;
		const current = (player.queue?.current as Track | null) ?? null;
		return isTtsClip(current) ? null : current;
	}
	const candidate = (player.queue?.tracks?.[0] as Track | null) ?? null;
	return isTtsClip(candidate) ? null : candidate;
}

export interface QueueMutationOptions {
	invalidate?: boolean;
	bumpEpoch?: boolean;
	force?: boolean;
}

export function notifyQueueMutated(deps: LavalinkDeps, player: CustomPlayer, opts: QueueMutationOptions = {}): void {
	if (!player.mixerRuntime) return;
	const target = getTargetNextTrack(player);
	const targetUid = getTrackUid(target);

	if (!opts.force && targetUid === player.mixerRuntime.lastTargetUid) {
		return;
	}

	void deps.mixerService.prepareNextAnalysis(player, target);
	deps.sponsorBlockService.prefetch(target);
	player.mixerRuntime.lastTargetUid = targetUid;
	if (opts.bumpEpoch !== false) {
		player.currentEpoch++;
	}
	deps.sponsorBlockService.queueChanged(player);

	if (player.mixerRuntime.invalidateTimer) {
		clearTimeout(player.mixerRuntime.invalidateTimer);
		player.mixerRuntime.invalidateTimer = null;
	}

	if (opts.invalidate === false) {
		return;
	}

	const epochToInvalidate = player.currentEpoch;
	player.mixerRuntime.invalidateTimer = setTimeout(() => {
		player.mixerRuntime.invalidateTimer = null;
		void deps.mixerService
			?.invalidate?.(player, epochToInvalidate)
			?.catch((err: unknown) => deps.logger?.warn?.(`[mixer] invalidate failed (guild ${player.guildId}): ${err}`));
	}, 50);
}

export function cancelPendingInvalidate(player: CustomPlayer): void {
	if (player.mixerRuntime?.invalidateTimer) {
		clearTimeout(player.mixerRuntime.invalidateTimer);
		player.mixerRuntime.invalidateTimer = null;
	}
}
