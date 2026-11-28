import { Player, Track, UnresolvedTrack } from 'lavalink-client';
import { CustomPlayer, transitionConfirmTimeoutMs } from './player/customPlayer.ts';
import type { LavalinkDeps } from './deps.ts';
import { isYouTubeSource } from '@sirubot/utils';
import { needsUpcomingTrack } from '@sirubot/utils/mixerTransition';
import { requesterIdOf, RELATED_TRACK_REQUESTER_ID } from './requester.ts';
import { notifyQueueMutated } from './queue/queueWrapper.ts';
import { isSameEncodedTrack } from './handlers/playbackWatchdog.ts';
import { RelatedTrackHistory } from './player/relatedTrackHistory.ts';
import { getConfig } from '../../../lib/config.ts';
import * as guildMixer from '../../../services/guildSettings/mixer.ts';
import * as guildPlayback from '../../../services/guildSettings/playback.ts';

const highSimilarity = (): number => getConfig().autoplay.highSimilarity;
const lowSimilarity = (): number => getConfig().autoplay.lowSimilarity;

const TITLE_WEIGHT = 0.6;
const DURATION_WEIGHT = 0.4;

export function getInFlightRelatedFetch(deps: LavalinkDeps, guildId: string): Promise<Track | null> | undefined {
	return deps.relatedFetchInFlight.get(String(guildId));
}

export function isRelatedTrack(track: Track | UnresolvedTrack | null | undefined): boolean {
	const requester = track?.requester;
	const requesterId = requester && typeof requester === 'object' ? (requester as { id?: unknown }).id : requester;
	return requesterId === RELATED_TRACK_REQUESTER_ID;
}

/** Must run after queue.add so an in-flight preload fetch doesn't re-add against an empty queue. */
export async function removeStaleRelatedTracks(deps: LavalinkDeps, player: Player): Promise<number> {
	const tracks = player.queue.tracks;
	const relatedIndexes: number[] = [];
	for (let i = 0; i < tracks.length; i++) {
		if (isRelatedTrack(tracks[i])) relatedIndexes.push(i);
	}
	if (relatedIndexes.length === 0) return 0;

	const isContiguousTail =
		relatedIndexes.every((value, i) => value === relatedIndexes[0] + i) && relatedIndexes[relatedIndexes.length - 1] === tracks.length - 1;
	if (isContiguousTail) {
		await player.queue.splice(relatedIndexes[0], relatedIndexes.length);
	} else {
		for (let i = relatedIndexes.length - 1; i >= 0; i--) {
			await player.queue.splice(relatedIndexes[i], 1);
		}
	}
	deps.logger.debug(`[autoPlayRelated] Removed ${relatedIndexes.length} pre-added related track(s) (guild ${player.guildId})`);
	return relatedIndexes.length;
}

export function getUserQueuedTracks(player: Player): Track[] {
	return player.queue.tracks.filter((track) => !isRelatedTrack(track)) as Track[];
}

export function remainingUntilQueueEnd(player: Player, queuedTracks: Track[]): number {
	const current = player.queue.current;
	const elapsed = current && !current.info.isStream ? Math.min(player.position ?? 0, current.info.duration ?? 0) : 0;
	const queuedDuration = queuedTracks.reduce((acc, track) => acc + (track.info.duration || 0), 0);
	return Math.max(0, (current?.info.duration ?? 0) + queuedDuration - elapsed);
}

export function normalizeTitle(title: string): string {
	return title
		.toLowerCase()
		.replace(/\s*[\(\[\{].*?[\)\]\}]\s*/g, '')
		.replace(/\s*[-–—|].*$/, '')
		.replace(/[^\p{L}\p{N}\s]/gu, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function getBigrams(str: string): string[] {
	const bigrams: string[] = [];
	for (let i = 0; i < str.length - 1; i++) {
		bigrams.push(str.substring(i, i + 2));
	}
	return bigrams;
}

export function titleSimilarity(titleA: string, titleB: string): number {
	const a = normalizeTitle(titleA);
	const b = normalizeTitle(titleB);

	// Guard against empty normalized titles becoming 1.0 similarity.
	if (a.length === 0 || b.length === 0) return 0;
	if (a === b) return 1;
	if (a.length < 2 || b.length < 2) return 0;

	const bigramsA = getBigrams(a);
	const bigramsB = getBigrams(b);

	const bigramCountB = new Map<string, number>();
	for (const bg of bigramsB) {
		bigramCountB.set(bg, (bigramCountB.get(bg) ?? 0) + 1);
	}

	let intersectionSize = 0;
	for (const bg of bigramsA) {
		const count = bigramCountB.get(bg) ?? 0;
		if (count > 0) {
			intersectionSize++;
			bigramCountB.set(bg, count - 1);
		}
	}

	return (2 * intersectionSize) / (bigramsA.length + bigramsB.length);
}

function durationSimilarity(durationA: number, durationB: number): number {
	if (durationA === 0 && durationB === 0) return 1;
	const maxDuration = Math.max(durationA, durationB);
	if (maxDuration === 0) return 1;

	return 1 - Math.abs(durationA - durationB) / maxDuration;
}

function trackSimilarity(trackA: Track, trackB: Track): number {
	const titleSim = titleSimilarity(trackA.info.title, trackB.info.title);
	const durationSim = durationSimilarity(trackA.info.duration, trackB.info.duration);

	return titleSim * TITLE_WEIGHT + durationSim * DURATION_WEIGHT;
}

const PICK_POOL_SIZE = 8;
const MIN_PICK_WEIGHT = 0.05;

export function weightedPick<T extends { similarity: number }>(items: T[], random: () => number = Math.random): T {
	const weights = items.map((item) => Math.max(item.similarity, MIN_PICK_WEIGHT));
	const total = weights.reduce((acc, w) => acc + w, 0);
	let roll = random() * total;
	for (let i = 0; i < items.length; i++) {
		roll -= weights[i];
		if (roll < 0) return items[i];
	}
	return items[items.length - 1];
}

export function pickBySimilarity(deps: LavalinkDeps, candidates: Track[], reference: Track, random: () => number = Math.random): Track | null {
	if (candidates.length === 0) return null;

	const scored = candidates.map((track) => ({
		track,
		similarity: trackSimilarity(reference, track)
	}));

	let pool = scored.filter((s) => s.similarity > lowSimilarity() && s.similarity < highSimilarity());

	if (pool.length === 0) pool = scored.filter((s) => s.similarity < highSimilarity());

	if (pool.length === 0) pool = scored;

	pool.sort((a, b) => b.similarity - a.similarity);
	const pick = weightedPick(pool.slice(0, PICK_POOL_SIZE), random);

	deps.logger.debug(`[autoPlayRelated] Picked track by similarity: "${pick.track.info.title}" (score: ${pick.similarity.toFixed(3)})`);
	return pick.track;
}

export async function fetchRelatedCandidate(
	deps: LavalinkDeps,
	player: CustomPlayer,
	lastPlayedTrack: Track,
	extraExcludes: string[] = []
): Promise<Track | null> {
	const RD_PLAYLIST_ID = 'RD' + lastPlayedTrack.info.identifier;
	const history = player.relatedTrackHistory;
	history.remember(lastPlayedTrack);
	for (const track of player.queue.previous) history.remember(track);

	try {
		const searchResult = await player.node.search('https://youtube.com/playlist?list=' + RD_PLAYLIST_ID, {
			id: RELATED_TRACK_REQUESTER_ID,
			username: null
		});
		deps.logger.debug(`Search result loadType: ${searchResult.loadType}, tracks: ${searchResult.tracks.length}`);

		if (searchResult.loadType === 'error' || searchResult.loadType === 'empty') {
			deps.logger.debug(`Related search failed (${searchResult.loadType}): ${lastPlayedTrack.info.identifier}`);
			return null;
		}

		const excludedIdentifiers = new Set<string>(extraExcludes);
		for (const track of player.queue.previous) history.remember(track);
		const queued = new RelatedTrackHistory();
		if (player.queue.current) queued.remember(player.queue.current);
		for (const track of player.queue.tracks) queued.remember(track);

		const availableTracks = searchResult.tracks.filter(
			(track) => !excludedIdentifiers.has(track.info.identifier) && !history.has(track) && !queued.has(track)
		);

		if (availableTracks.length > 0) {
			const selectedTrack = pickBySimilarity(deps, availableTracks, lastPlayedTrack);
			if (selectedTrack) return selectedTrack;
		}

		deps.logger.debug(`No eligible related tracks found for: ${lastPlayedTrack.info.identifier} (candidates: ${searchResult.tracks.length})`);
		return null;
	} catch (error) {
		deps.logger.error(`Error fetching related tracks: ${error}`);
		return null;
	}
}

export const queueRelatedUpfront = async (deps: LavalinkDeps, player: CustomPlayer, currentTrack: Track): Promise<Track | null> => {
	const gid = String(player.guildId);
	if (deps.relatedFetchInFlight.has(gid)) return null;
	const currentEncoded = (currentTrack as { encoded?: unknown }).encoded;
	const operation = (async (): Promise<Track | null> => {
		const relatedOn = await guildPlayback.getRelated(deps.guildService, player.guildId);
		if (!relatedOn || player.repeatMode !== 'off') return null;
		if (!currentTrack.info.identifier || !isYouTubeSource(currentTrack.info.sourceName)) return null;

		const settings = await guildMixer.getMixerSettings(deps.guildService, gid);
		if (!needsUpcomingTrack(settings)) return null;

		const selectedTrack = await fetchRelatedCandidate(deps, player, currentTrack);
		if (!selectedTrack) return null;

		const activeEncoded = (player.queue.current as { encoded?: unknown } | null)?.encoded;
		if (
			player.transitionState.stopByCommand ||
			player.queue.tracks.length > 0 ||
			(player.playing && !isSameEncodedTrack(activeEncoded, currentEncoded))
		)
			return null;

		await player.queue.add(selectedTrack);
		if ((player as CustomPlayer).mixerRuntime) notifyQueueMutated(deps, player as CustomPlayer);
		if (player.playing) {
			await deps.mixerService.preloadUpcoming(player).catch(() => null);
		}
		return selectedTrack;
	})();
	deps.relatedFetchInFlight.set(gid, operation);
	try {
		return await operation;
	} finally {
		if (deps.relatedFetchInFlight.get(gid) === operation) deps.relatedFetchInFlight.delete(gid);
	}
};

export const addManualRecommendation = async (deps: LavalinkDeps, player: CustomPlayer, reference: Track, count: number): Promise<Track[]> => {
	const gid = String(player.guildId);
	if (deps.relatedFetchInFlight.has(gid)) return [];

	const referenceEncoded = (reference as { encoded?: unknown }).encoded;
	const operation = async (): Promise<Track[]> => {
		if (!reference.info.identifier || !isYouTubeSource(reference.info.sourceName)) return [];

		const added: Track[] = [];
		const pickedIds: string[] = [];
		for (let i = 0; i < count; i++) {
			const selected = await fetchRelatedCandidate(deps, player, reference, pickedIds);
			if (!selected) break;

			const activeEncoded = (player.queue.current as { encoded?: unknown } | null)?.encoded;
			if (player.transitionState.stopByCommand || (player.queue.current && !isSameEncodedTrack(activeEncoded, referenceEncoded))) break;

			await player.queue.add(selected);
			pickedIds.push(selected.info.identifier);
			added.push(selected);
		}

		if (added.length > 0 && player.playing) {
			await deps.mixerService.preloadUpcoming(player).catch(() => null);
		}
		return added;
	};

	// Shares the Promise<Track | null> in-flight guard with queueRelatedUpfront and autoPlayRelated.
	const runs = operation();
	const tracked: Promise<Track | null> = runs.then((tracks) => tracks[0] ?? null);
	deps.relatedFetchInFlight.set(gid, tracked);
	try {
		return await runs;
	} finally {
		if (deps.relatedFetchInFlight.get(gid) === tracked) deps.relatedFetchInFlight.delete(gid);
	}
};

export const autoPlayRelated = async (deps: LavalinkDeps, player: CustomPlayer, lastPlayedTrack?: Track | null): Promise<void> => {
	const referenceTrack = lastPlayedTrack ?? player.queue.previous?.[0] ?? player.queue.current ?? null;
	if (!referenceTrack?.info) {
		deps.logger.debug('[autoPlayRelated] No reference track available, skipping fallback');
		return;
	}

	// Skip fallback while a server-side preloaded transition is in flight.
	const transitionState = (player as CustomPlayer).transitionState;
	const consumedRecently =
		transitionState?.preloadConsumedAt != null && Date.now() - transitionState.preloadConsumedAt < transitionConfirmTimeoutMs();
	if (deps.mixerService.isPreloaded(String(player.guildId)) || consumedRecently) {
		deps.logger.debug('[autoPlayRelated] Server-side transition in flight, skipping fallback');
		return;
	}
	const relatedOn = await guildPlayback.getRelated(deps.guildService, player.guildId);
	if (player.repeatMode == 'off' && relatedOn) {
		if (referenceTrack.info.identifier && isYouTubeSource(referenceTrack.info.sourceName)) {
			if (deps.relatedFetchInFlight.has(String(player.guildId))) {
				deps.logger.debug('[autoPlayRelated] Pre-add in flight, skipping fallback');
				return;
			}

			const currentRequesterId = requesterIdOf(player.queue.current ?? undefined);
			if ((player.queue.current && currentRequesterId !== null) || player.queue.tracks.length > 0) {
				deps.logger.debug('[autoPlayRelated] Prevent race condition: user added track');
				return;
			}

			const selectedTrack = await fetchRelatedCandidate(deps, player, referenceTrack);
			if (!selectedTrack) {
				return;
			}

			const recheckRequesterId = requesterIdOf(player.queue.current ?? undefined);
			if ((player.queue.current && recheckRequesterId !== null) || player.queue.tracks.length > 0) {
				deps.logger.debug('[autoPlayRelated] Prevent race condition after search: user added track');
				return;
			}

			await player.queue.add(selectedTrack);
			if ((player as CustomPlayer).mixerRuntime) notifyQueueMutated(deps, player as CustomPlayer);
		}
	}
};
