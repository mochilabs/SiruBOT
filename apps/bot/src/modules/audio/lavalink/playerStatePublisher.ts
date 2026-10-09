/**
 * 플레이어 상태 퍼블리셔 — trackStart/trackEnd/queueEnd/playerUpdate 이벤트 훅에서
 * Redis Pub/Sub(`sirubot:player:{guildId}`)으로 상태 스냅샷을 보내요.
 *
 * - data-api의 playerHub가 유일한 구독자예요 (봇은 퍼블리시 전용).
 * - 5초 주기 캐시 + 상태 변경(트랙/재생/정지/큐 지문) 시 즉시 퍼블리시해요.
 * - 완전 fire-and-forget — 재생 경로를 절대 블로킹하지 않아요.
 * - 제어(일시정지/스킵 등)는 이 퍼블리시로 하지 않는다 — 제어는 bot RPC로 별도 구현 예정.
 */
import { container } from '@sapphire/framework';
import type { Track } from 'lavalink-client';
import { getUserQueuedTracks } from './autoPlayRelated.ts';
import { requesterIdOf, resolveRequesterName } from './requester.ts';
import type { CustomPlayer } from './player/customPlayer.ts';

const IMMEDIATE_INTERVAL_MS = 5_000;

export interface QueuedTrackSummary {
	title: string;
	author: string;
	durationMs: number;
	artworkUrl: string | null;
	isStream: boolean;
	requesterName: string | null;
}

export interface PlayerStatePayload {
	guildId: string;
	playing: boolean;
	paused: boolean;
	positionMs: number;
	durationMs: number;
	trackTitle: string | null;
	trackAuthor: string | null;
	artworkUrl: string | null;
	isStream: boolean;
	/** 유저가 신청한 대기열 앞 5곡 요약 (추천곡 제외) */
	queue: QueuedTrackSummary[];
	queueLength: number;
	repeatMode: 'off' | 'track' | 'queue';
	volume: number;
	requesterName: string | null;
	sourceName: string | null;
	updatedAt: number;
}

/** 길드별 마지막 퍼블리시 (주기 캐시 + 변경 감지 지문) */
const lastPublish = new Map<string, { at: number; fingerprint: string }>();

function summarizeTrack(track: CustomPlayer['queue']['current'], requesterName: string | null): QueuedTrackSummary | null {
	if (!track) return null;
	return {
		title: track.info.title?.slice(0, 200) ?? '알 수 없는 곡',
		author: track.info.author?.slice(0, 120) ?? '알 수 없는 아티스트',
		durationMs: track.info.duration ?? 0,
		artworkUrl: track.info.artworkUrl ?? null,
		isStream: track.info.isStream ?? false,
		requesterName
	};
}

/** 유저 표시 이름 조회 — 캐시 미스 시 비동기 fetch지만 퍼블리시는 fire-and-forget이므로 무관해요 */
/** 플레이어에서 상태 스냅샷을 만들어요 (동기 — 이벤트 훅에서 안전) */
export function buildPlayerStatePayload(player: CustomPlayer): PlayerStatePayload {
	const current = player.queue.current;
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
		isStream: current?.info.isStream ?? false,
		queue: queued.slice(0, 5).map((track) => {
			return summarizeTrack(track as CustomPlayer['queue']['current'], resolveRequesterName(player, requesterIdOf(track as Track)))!;
		}),
		queueLength: queued.length,
		repeatMode: player.repeatMode,
		volume: player.volume,
		requesterName: resolveRequesterName(player, requesterId),
		sourceName: typeof current?.info.sourceName === 'string' ? current.info.sourceName : null,
		updatedAt: Date.now()
	};
}

/** 상태 지문 — 트랙/재생 상태/큐 구성이 바뀌면 즉시 퍼블리시하기 위한 키 */
function statusFingerprint(state: PlayerStatePayload): string {
	return [
		state.trackTitle ?? '',
		state.playing ? '1' : '0',
		state.paused ? '1' : '0',
		state.queueLength,
		state.queue.map((t) => t.title).join('|')
	].join('§');
}

/**
 * 플레이어 상태를 퍼블리시해요. 상태 지문이 바뀌면 즉시, 아니면 5초 주기로 보내요.
 * fire-and-forget — Redis 미연결 시 redisStore가 조용히 스킵해요.
 */
export function publishPlayerState(player: CustomPlayer): void {
	const store = container.redisStore;
	if (!store?.ready) return;

	const payload = buildPlayerStatePayload(player);
	const fingerprint = statusFingerprint(payload);
	const previous = lastPublish.get(player.guildId);
	const now = Date.now();

	if (previous && previous.fingerprint === fingerprint && now - previous.at < IMMEDIATE_INTERVAL_MS) return;

	lastPublish.set(player.guildId, { at: now, fingerprint });
	store.publishRawPlayerState(player.guildId, JSON.stringify(payload));
}

/** 플레이어 파괴 시 마지막 퍼블리시 상태 정리 */
export function clearPlayerStateTracker(guildId: string): void {
	lastPublish.delete(guildId);
}
