/**
 * 플레이어 상태 허브 — 봇 샤드들이 Redis Pub/Sub(`sirubot:player:{guildId}`)으로
 * 퍼블리시한 라이브 재생 상태를 구독해 인메모리에 보관해요.
 *
 * - 구독자는 data-api가 유일해요 (봇은 퍼블리셔).
 * - REDIS_URL이 없으면 구독 없이 인메모리만 유지해요 (모든 guild가 stale/unavailable).
 * - 마지막 갱신 기준 60초가 지나면 stale로 표시해요 (404 대신 staleness 필드로 알려요).
 */
import { createClient, type RedisClientType } from '@redis/client';
import { getLogger } from '../utils/logger.ts';
import { sharedCache } from '../utils/cache.ts';

const logger = getLogger('playerHub');

/** 마지막 갱신 기준 이 시간이 지나면 stale */
const STALE_MS = 60_000;
/** 길드 상태 엔트리 최대 보관 수 (장기 비활성 길드 누수 방지) */
const MAX_ENTRIES = 5_000;

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
	queue: QueuedTrackSummary[];
	queueLength: number;
	repeatMode: 'off' | 'track' | 'queue';
	volume: number;
	requesterName: string | null;
	sourceName: string | null;
	updatedAt: number;
}

interface Entry {
	state: PlayerStatePayload;
	lastUpdate: number;
}

const states = new Map<string, Entry>();

/** SSE 구독자 — 길드별 콜백 목록 */
const sseSubscribers = new Map<string, Set<(payload: string) => void>>();

/** 새 스냅샷을 SSE 구독자에게 그대로 전송 */
export function notifySseSubscribers(guildId: string, payload: string): void {
	const subs = sseSubscribers.get(guildId);
	if (!subs) return;
	for (const send of subs) {
		try {
			send(payload);
		} catch {
			// 끊긴 구독자 — close 훅에서 정리된다
		}
	}
}

/** SSE 구독 등록. 해제 함수 반환 */
export function subscribeSse(guildId: string, send: (payload: string) => void): () => void {
	let set = sseSubscribers.get(guildId);
	if (!set) {
		set = new Set();
		sseSubscribers.set(guildId, set);
	}
	set.add(send);
	return () => {
		const current = sseSubscribers.get(guildId);
		if (!current) return;
		current.delete(send);
		if (current.size === 0) sseSubscribers.delete(guildId);
	};
}

/** 채널명에서 guildId를 뽑아요 — `sirubot:player:{guildId}` */
export function guildIdFromChannel(channel: string): string | null {
	const prefix = 'sirubot:player:';
	return channel.startsWith(prefix) ? channel.slice(prefix.length) : null;
}

function handleMessage(message: string, channel: string): void {
	const guildId = guildIdFromChannel(channel);
	if (!guildId) return;

	try {
		const parsed = JSON.parse(message) as PlayerStatePayload;
		if (typeof parsed !== 'object' || parsed === null || parsed.guildId !== guildId) return;

		if (states.size >= MAX_ENTRIES && !states.has(guildId)) {
			// 가장 오래된 엔트리를 하나 비워요 — 정확한 LRU는 아니지만 충분해요.
			const oldest = [...states.entries()].sort((a, b) => a[1].lastUpdate - b[1].lastUpdate)[0];
			if (oldest) states.delete(oldest[0]);
		}

		states.set(guildId, { state: parsed, lastUpdate: Date.now() });
		// raw pub/sub 메시지를 그대로 relay하면 나이/stale이 빠진 형태라 대시보드 {player, hub} 계약이 깨져요 —
		// 첫 프레임과 동일한 엔벨로프로 재조립해 내려요.
		notifySseSubscribers(guildId, JSON.stringify({ player: getPlayerState(guildId), hub: playerHubStatus() }));
	} catch (error) {
		logger.debug(`Malformed player state from ${channel}: ${error instanceof Error ? error.message : String(error)}`);
	}
}

let subscriber: RedisClientType | null = null;

/**
 * Pub/Sub 구독자를 연결해요. sharedCache 클라이언트를 duplicate해요 (RESP2 전용 연결 필요).
 * REDIS_URL이 없거나 연결 실패 시 조용히 인메모리 폴백 — 서비스 시작은 절대 막지 않아요.
 */
export async function startPlayerHub(redisUrl: string | undefined): Promise<void> {
	if (!redisUrl) {
		logger.warn('REDIS_URL is not set, player hub will have no live states (in-memory only)');
		return;
	}

	try {
		const base = sharedCache.getClient();
		subscriber = (base ? base.duplicate() : createClient({ url: redisUrl })) as RedisClientType;
		subscriber.on('error', (error) => logger.error(`player hub subscriber error: ${error}`));
		await subscriber.connect();
		await subscriber.pSubscribe('sirubot:player:*', (message, channel) => handleMessage(message, channel));
		logger.info('Player hub subscribed to sirubot:player:*');
	} catch (error) {
		logger.warn(`Player hub subscription failed, live states unavailable: ${error}`);
		subscriber = null;
	}
}

export async function stopPlayerHub(): Promise<void> {
	if (!subscriber) return;
	const client = subscriber;
	subscriber = null;
	await client.pUnsubscribe('sirubot:player:*').catch(() => undefined);
	await client.quit().catch(() => undefined);
}

export interface PlayerStateResponse extends PlayerStatePayload {
	/** 마지막 갱신 기준 밀리초 — 이 값이 STALE_MS를 넘으면 상태는 참고용이에요 */
	ageMs: number;
	/** 마지막 갱신이 60초보다 오래됐어요 (봇이 이 길드를 구독/퍼블리시하지 않는 상태) */
	stale: boolean;
}

export function getPlayerState(guildId: string): PlayerStateResponse | null {
	const entry = states.get(guildId);
	if (!entry) return null;
	const now = Date.now();
	return { ...entry.state, ageMs: now - entry.lastUpdate, stale: now - entry.lastUpdate > STALE_MS };
}

/** 관제용 — 현재 보관 중인 길드 수 */
export function playerHubStatus(): { guilds: number; subscribed: boolean; staleMs: number } {
	return { guilds: states.size, subscribed: subscriber?.isOpen === true, staleMs: STALE_MS };
}
