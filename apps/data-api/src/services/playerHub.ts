/**
 * 플레이어 상태 허브 — 봇 샤드들이 Redis Pub/Sub(`sirubot:player:{guildId}`)으로
 * 퍼블리시한 라이브 재생 상태를 구독해 인메모리에 보관해요.
 *
 * - 구독자는 data-api가 유일해요 (봇은 퍼블리셔).
 * - REDIS_URL이 없으면 구독 없이 인메모리만 유지해요 (모든 guild가 stale/unavailable).
 * - 마지막 갱신 기준 60초가 지나면 stale로 표시해요 (404 대신 staleness 필드로 알려요).
 */
import {
	PLAYER_STATE_CHANNEL_PATTERN,
	guildIdFromPlayerStateChannel,
	playerStateSchema,
	type PlayerStatePayload,
	type PlayerStateResponse
} from '@sirubot/utils';
import { getLogger } from '../utils/logger.ts';
import { HubSubscriber } from '../utils/hubSubscriber.ts';

const logger = getLogger('playerHub');

/** 마지막 갱신 기준 이 시간이 지나면 stale */
const STALE_MS = 60_000;
/** 길드 상태 엔트리 최대 보관 수 (장기 비활성 길드 누수 방지) */
const MAX_ENTRIES = 5_000;

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

function handleMessage(message: string, channel: string): void {
	const guildId = guildIdFromPlayerStateChannel(channel);
	if (!guildId) return;

	try {
		const result = playerStateSchema.safeParse(JSON.parse(message));
		if (!result.success) {
			logger.debug(`Malformed player state from ${channel}: ${result.error.issues[0]?.message ?? 'invalid shape'}`);
			return;
		}
		const parsed: PlayerStatePayload = result.data;
		if (parsed.guildId !== guildId) return;

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

/** Pub/Sub 구독자 — 공용 라이프사이클(HubSubscriber)에 연결·구독·재시도·종료를 위임해요. */
const subscriber = new HubSubscriber({
	name: 'player hub',
	channel: PLAYER_STATE_CHANNEL_PATTERN,
	pattern: true,
	onMessage: handleMessage,
	logger
});

/**
 * Pub/Sub 구독자 연결을 시작해요. 최초 연결은 백그라운드로 돌아가요 — Redis가 data-api보다
 * 늦게 떠도 재시도 루프가 구독까지 완성하고, 서비스 시작을 절대 막지 않아요.
 * REDIS_URL이 없으면 구독 없이 인메모리만 유지해요 (모든 guild가 stale/unavailable).
 */
export async function startPlayerHub(redisUrl: string | undefined): Promise<void> {
	if (!redisUrl) {
		logger.warn('REDIS_URL is not set, player hub will have no live states (in-memory only)');
		return;
	}
	await subscriber.start(redisUrl);
}

export async function stopPlayerHub(): Promise<void> {
	await subscriber.stop();
}

export function getPlayerState(guildId: string): PlayerStateResponse | null {
	const entry = states.get(guildId);
	if (!entry) return null;
	const now = Date.now();
	return { ...entry.state, ageMs: now - entry.lastUpdate, stale: now - entry.lastUpdate > STALE_MS };
}

/** 관제용 — 현재 보관 중인 길드 수와 실제 구독 상태 (소켓이 아니라 pSubscribe/재구독 완료 기준) */
export function playerHubStatus(): { guilds: number; subscribed: boolean; staleMs: number } {
	return { guilds: states.size, subscribed: subscriber.isSubscribed, staleMs: STALE_MS };
}
