/**
 * 플레이어 상태 퍼블리셔 — trackStart/trackEnd/queueEnd/playerUpdate 이벤트 훅에서
 * Redis Pub/Sub(`sirubot:player:{guildId}`)으로 상태 스냅샷을 보내요.
 *
 * - data-api의 playerHub가 유일한 구독자예요 (봇은 퍼블리시 전용).
 * - 5초 주기 캐시 + 상태 변경(트랙/재생/정지/큐 지문) 시 즉시 퍼블리시해요.
 * - 탐색·위치 점프(예상 위치와 1.5초 이상 차이)와 곡 시작도 5초 제한 없이 즉시 퍼블리시해요 (노래방 가사가 어긋나지 않게).
 * - 완전 fire-and-forget — 재생 경로를 절대 블로킹하지 않아요.
 * - 제어(일시정지/스킵 등)는 이 퍼블리시로 하지 않는다 — 제어는 bot RPC로 별도 구현 예정.
 */
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
/** 예상 위치와 이 이상 어긋나면 탐색·점프로 보고 즉시 발행해요. */
const POSITION_JUMP_THRESHOLD_MS = 1_500;

/** 스로틀 상태는 deps.playerStatePublishTracker(setupServices가 한 번 만든 Map)에 있어요 — trackHandler/playerHandler가 같이 써요. */
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

/** 유저 표시 이름 조회 — 캐시 미스 시 비동기 fetch지만 퍼블리시는 fire-and-forget이므로 무관해요 */
/** 플레이어에서 상태 스냅샷을 만들어요 (동기 — 이벤트 훅에서 안전) */
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

/** 상태 지문 — 트랙/재생 상태/큐 구성이 바뀌면 즉시 퍼블리시하기 위한 키 */
function statusFingerprint(state: PlayerStatePayload): string {
	// 볼륨·반복모드도 지문에 포함 — positionMs처럼 매초 바뀌는 값이 아니라 바뀔 때만 즉시 반영돼요
	return [
		state.trackTitle ?? '',
		state.playing ? '1' : '0',
		state.paused ? '1' : '0',
		state.repeatMode,
		state.volume,
		// 같은 제목의 다른 곡(다른 업로드)으로 바뀌어도 즉시 반영돼요
		state.trackUri ?? '',
		state.queueLength,
		state.queue.map((t) => t.title).join('|')
	].join('§');
}

/**
 * 플레이어 상태를 퍼블리시해요. 상태 지문이 바뀌거나 곡 시작(`immediate`)·위치 점프면 즉시, 아니면 5초 주기로 보내요.
 * fire-and-forget — Redis 미연결 시 redisStore가 조용히 스킵해요.
 */
export function publishPlayerState(deps: LavalinkDeps, player: CustomPlayer, options: { immediate?: boolean } = {}): void {
	const store = deps.redisStore;
	if (!store?.ready) return;

	const payload = buildPlayerStatePayload(deps, player);
	const fingerprint = statusFingerprint(payload);
	const tracker = getPublishTracker(deps);
	const previous = tracker.get(player.guildId);
	const now = Date.now();

	// 마지막 발행 이후 정상 재생이면 있어야 할 위치 — 크게 어긋나면 탐색·점프예요
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
	// state 허브가 fail-closed 검증을 하므로 서명을 붙여 보내요 (키 없으면 구버전 평문).
	store.publishRawPlayerState(player.guildId, wrapRedisMessage(getConfig().redis.signingKey, payload));
}

/**
 * 플레이어 확정 종료(tombstone)를 퍼블리시해요 — 큐 종료·플레이어 파괴 시점에만 호출해요.
 * ended:true 프레임은 스로틀을 건너뛰고 즉시 발행하며, playerHub가 받으면 길드 엔트리를 지우고
 * SSE에 player:null을 relay해 대시보드가 유령 상태 없이 빈 화면으로 돌아가요.
 * fire-and-forget — Redis 미연결 시 redisStore가 조용히 스킵해요.
 */
export function publishPlayerEnded(deps: LavalinkDeps, player: CustomPlayer): void {
	const store = deps.redisStore;
	if (!store?.ready) return;

	const payload: PlayerStatePayload = { ...buildPlayerStatePayload(deps, player), ended: true };
	// 종료 프레임은 이후 상태와 비교할 대상이 아니에요 — 스로틀 추적기를 비워요.
	getPublishTracker(deps).delete(player.guildId);
	store.publishRawPlayerState(player.guildId, wrapRedisMessage(getConfig().redis.signingKey, payload));
}

/** 플레이어 파괴 시 마지막 퍼블리시 상태 정리 */
export function clearPlayerStateTracker(deps: LavalinkDeps, guildId: string): void {
	getPublishTracker(deps).delete(guildId);
}
