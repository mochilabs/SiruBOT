import type { PlayerStatePayload, QueuedTrackSummary } from '@sirubot/utils';
import { wrapRedisMessage } from '@sirubot/utils/redisEnvelope';
import { getConfig } from '../../../lib/config.ts';
import type { Track } from 'lavalink-client';
import { getUserQueuedTracks } from './autoPlayRelated.ts';
import { nowPlayingTrack } from './player/nowPlaying.ts';
import { requesterIdOf, resolveRequesterName } from './requester.ts';
import type { CustomPlayer } from './player/customPlayer.ts';
import type { LavalinkDeps } from './deps.ts';

const IMMEDIATE_INTERVAL_MS = 5_000;
const POSITION_JUMP_THRESHOLD_MS = 1_500;

function getPublishTracker(deps: LavalinkDeps) {
	return deps.playerStatePublishTracker;
}

function summarizeTrack(track: CustomPlayer['queue']['current'], requesterName: string | null): QueuedTrackSummary | null {
	if (!track) return null;
	return {
		title: track.info.title?.slice(0, 200) ?? '알 수 없는 곡',
		author: track.info.author?.slice(0, 120) ?? '알 수 없는 아티스트',
		durationMs: track.info.duration ?? 0,
		artworkUrl: track.info.artworkUrl ?? null,
		uri: track.info.uri ?? null,
		isStream: track.info.isStream ?? false,
		requesterName
	};
}

export function buildPlayerStatePayload(deps: LavalinkDeps, player: CustomPlayer): PlayerStatePayload {
	const current = nowPlayingTrack(player);
	const queued = getUserQueuedTracks(player);
	const requesterId = requesterIdOf(current ?? undefined);

	return {
		guildId: player.guildId,
		playing: player.playing,
		paused: player.paused,
		positionMs: Math.max(0, player.position ?? 0),
		durationMs: current?.info.duration ?? 0,
		trackTitle: current?.info.title?.slice(0, 200) ?? null,
		trackAuthor: current?.info.author?.slice(0, 120) ?? null,
		artworkUrl: current?.info.artworkUrl ?? null,
		trackUri: current?.info.uri ?? null,
		isStream: current?.info.isStream ?? false,
		queue: queued.slice(0, 5).map((track) => {
			return summarizeTrack(track as CustomPlayer['queue']['current'], resolveRequesterName(deps, player, requesterIdOf(track as Track)))!;
		}),
		queueLength: queued.length,
		repeatMode: player.repeatMode,
		volume: player.volume,
		requesterName: resolveRequesterName(deps, player, requesterId),
		sourceName: typeof current?.info.sourceName === 'string' ? current.info.sourceName : null,
		updatedAt: Date.now()
	};
}

function statusFingerprint(state: PlayerStatePayload): string {
	return [
		state.trackTitle ?? '',
		state.playing ? '1' : '0',
		state.paused ? '1' : '0',
		state.repeatMode,
		state.volume,
		state.trackUri ?? '',
		state.queueLength,
		state.queue.map((t) => t.title).join('|')
	].join('§');
}

export function publishPlayerState(deps: LavalinkDeps, player: CustomPlayer, options: { immediate?: boolean } = {}): void {
	const store = deps.redisStore;
	if (!store?.ready) return;

	const payload = buildPlayerStatePayload(deps, player);
	const fingerprint = statusFingerprint(payload);
	const tracker = getPublishTracker(deps);
	const previous = tracker.get(player.guildId);
	const now = Date.now();

	const expectedPositionMs = previous ? previous.positionMs + (previous.advancing ? now - previous.at : 0) : payload.positionMs;
	const positionJumped = previous !== undefined && Math.abs(payload.positionMs - expectedPositionMs) >= POSITION_JUMP_THRESHOLD_MS;

	if (!options.immediate && !positionJumped && previous && previous.fingerprint === fingerprint && now - previous.at < IMMEDIATE_INTERVAL_MS)
		return;

	tracker.set(player.guildId, {
		at: now,
		fingerprint,
		positionMs: payload.positionMs,
		advancing: payload.playing && !payload.paused && !payload.isStream
	});
	store.publishRawPlayerState(player.guildId, wrapRedisMessage(getConfig().redis.signingKey, payload));
}

export function publishPlayerEnded(deps: LavalinkDeps, player: CustomPlayer): void {
	const store = deps.redisStore;
	if (!store?.ready) return;

	const payload: PlayerStatePayload = { ...buildPlayerStatePayload(deps, player), ended: true };
	getPublishTracker(deps).delete(player.guildId);
	store.publishRawPlayerState(player.guildId, wrapRedisMessage(getConfig().redis.signingKey, payload));
}

export function clearPlayerStateTracker(deps: LavalinkDeps, guildId: string): void {
	getPublishTracker(deps).delete(guildId);
}
