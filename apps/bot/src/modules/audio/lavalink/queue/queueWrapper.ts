import { randomUUID } from 'node:crypto';
import { Track, UnresolvedTrack } from 'lavalink-client';
import { container } from '@sapphire/framework';
import type { CustomPlayer } from '../player/customPlayer.ts';

/**
 * Ensures every track has a stable unique identifier stored in track.userData.uid.
 * This uid survives serialization to Redis because StoredQueue serializes tracks directly.
 */
export function ensureTrackUid(track: Track | UnresolvedTrack): string {
	if (!track.userData) {
		track.userData = {};
	}
	if (!track.userData.uid || typeof track.userData.uid !== 'string') {
		track.userData.uid = randomUUID();
	}
	return track.userData.uid;
}

/**
 * Returns the stable uid of a track, or falls back to its encoded/identifier string.
 */
export function getTrackUid(track: Track | UnresolvedTrack | null | undefined): string | null {
	if (!track) return null;
	if (track.userData?.uid && typeof track.userData.uid === 'string') {
		return track.userData.uid;
	}
	return ensureTrackUid(track);
}

/**
 * Returns the next target track to be played:
 * - In 'track' repeat mode: the current playing track.
 * - Otherwise: the first track waiting in queue.tracks[0].
 */
export function getTargetNextTrack(player: CustomPlayer): Track | null {
	if (player.repeatMode === 'track') {
		return (player.queue?.current as Track | null) ?? null;
	}
	return (player.queue?.tracks?.[0] as Track | null) ?? null;
}

export interface QueueMutationOptions {
	invalidate?: boolean;
}

/**
 * Central queue mutation observer.
 * Inspects whether the target next track (head) has changed.
 * Only increments player.currentEpoch when the head's uid actually changes.
 */
export function notifyQueueMutated(player: CustomPlayer, opts: QueueMutationOptions = {}): void {
	const target = getTargetNextTrack(player);
	const targetUid = getTrackUid(target);

	// If the head track's uid hasn't changed (e.g. tracks appended to the tail), do nothing
	if (targetUid === player.mixerRuntime.lastTargetUid) {
		return;
	}

	player.mixerRuntime.lastTargetUid = targetUid;
	player.currentEpoch++;

	// Cancel any pending debounced invalidate
	if (player.mixerRuntime.invalidateTimer) {
		clearTimeout(player.mixerRuntime.invalidateTimer);
		player.mixerRuntime.invalidateTimer = null;
	}

	// Invalidate is skipped when an immediate override is planned (e.g. user skip / recovery)
	if (opts.invalidate === false) {
		return;
	}

	// Debounce 50ms to coalesce rapid mutations (e.g. bulk playlist modifications)
	const epochToInvalidate = player.currentEpoch;
	player.mixerRuntime.invalidateTimer = setTimeout(() => {
		player.mixerRuntime.invalidateTimer = null;
		void container.mixerService
			.invalidate(player, epochToInvalidate)
			.catch((err) => container.logger.warn(`[mixer] invalidate failed (guild ${player.guildId}): ${err}`));
	}, 50);
}

/**
 * Cancels any currently pending debounced invalidate request.
 */
export function cancelPendingInvalidate(player: CustomPlayer): void {
	if (player.mixerRuntime.invalidateTimer) {
		clearTimeout(player.mixerRuntime.invalidateTimer);
		player.mixerRuntime.invalidateTimer = null;
	}
}
