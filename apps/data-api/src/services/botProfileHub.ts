/**
 * 봇 프로필 상태 허브 — 봇 샤드들이 Redis Pub/Sub(`sirubot:bot-profile:state:{guildId}`)으로
 * 퍼블리시한 길드별 봇 닉네임·아바타 상태를 구독해 인메모리에 보관해요.
 *
 * - 구독자는 data-api가 유일해요 (봇은 퍼블리셔).
 * - playerHub와 같은 구조예요 — READY·멤버 업데이트·적용 완료 때 봇이 퍼블리시해요.
 * - 마지막 갱신 기준 60초가 지나면 stale로 표시해요 (404 대신 staleness 필드로 알려요).
 * - SSE는 없어요 — 프로필은 자주 바뀌지 않아서 대시보드가 저장 직후 재조회하면 충분해요.
 */
import { BOT_PROFILE_STATE_CHANNEL_PREFIX } from '@sirubot/utils';
import { createClient, type RedisClientType } from '@redis/client';

import { sharedCache } from '../utils/cache.ts';
import { getLogger } from '../utils/logger.ts';

const logger = getLogger('botProfileHub');

/** 마지막 갱신 기준 이 시간이 지나면 stale */
const STALE_MS = 60_000;
/** 길드 상태 엔트리 최대 보관 수 (장기 비활성 길드 누수 방지) */
const MAX_ENTRIES = 5_000;
/** 구독 채널 패턴 — 봇 퍼블리시어(botProfileService)와 계약이에요 */
const CHANNEL_PATTERN = `${BOT_PROFILE_STATE_CHANNEL_PREFIX}*`;
/** 최초 연결 실패 재시도 백오프 — 1초부터 2배씩, 상한 5초 */
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 5_000;

export interface BotProfileStatePayload {
	guildId: string;
	nickname: string | null;
	username: string;
	guildAvatarUrl: string | null;
	globalAvatarUrl: string | null;
	canChangeNickname: boolean;
	lastApply: { ok: boolean; error: string | null; at: number } | null;
	updatedAt: number;
}

interface Entry {
	state: BotProfileStatePayload;
	lastUpdate: number;
}

const states = new Map<string, Entry>();

function isNullableString(value: unknown): value is string | null {
	return typeof value === 'string' || value === null;
}

/** 퍼블리시 페이로드 검증 — malformed 메시지는 조용히 버리고 정상 메시지만 인메모리에 심어요 */
function parsePayload(message: string, guildId: string): BotProfileStatePayload | null {
	try {
		const parsed = JSON.parse(message) as Partial<BotProfileStatePayload>;
		if (typeof parsed !== 'object' || parsed === null || parsed.guildId !== guildId) return null;
		if (!isNullableString(parsed.nickname) || typeof parsed.username !== 'string') return null;
		if (!isNullableString(parsed.guildAvatarUrl) || !isNullableString(parsed.globalAvatarUrl)) return null;
		if (typeof parsed.canChangeNickname !== 'boolean' || typeof parsed.updatedAt !== 'number') return null;

		let lastApply: BotProfileStatePayload['lastApply'] = null;
		if (parsed.lastApply !== null && parsed.lastApply !== undefined) {
			const apply = parsed.lastApply as BotProfileStatePayload['lastApply'];
			if (typeof apply !== 'object' || apply === null || typeof apply.ok !== 'boolean') return null;
			if (!isNullableString(apply.error) || typeof apply.at !== 'number') return null;
			lastApply = { ok: apply.ok, error: apply.error, at: apply.at };
		}

		return {
			guildId,
			nickname: parsed.nickname,
			username: parsed.username,
			guildAvatarUrl: parsed.guildAvatarUrl,
			globalAvatarUrl: parsed.globalAvatarUrl,
			canChangeNickname: parsed.canChangeNickname,
			lastApply,
			updatedAt: parsed.updatedAt
		};
	} catch (error) {
		logger.debug(
			`Malformed bot profile state from ${BOT_PROFILE_STATE_CHANNEL_PREFIX}${guildId}: ${
				error instanceof Error ? error.message : String(error)
			}`
		);
		return null;
	}
}

function handleMessage(message: string, channel: string): void {
	if (!channel.startsWith(BOT_PROFILE_STATE_CHANNEL_PREFIX)) return;
	const guildId = channel.slice(BOT_PROFILE_STATE_CHANNEL_PREFIX.length);
	if (!guildId) return;

	const payload = parsePayload(message, guildId);
	if (!payload) return;

	if (states.size >= MAX_ENTRIES && !states.has(guildId)) {
		// 가장 오래된 엔트리를 하나 비워요 — 정확한 LRU는 아니지만 충분해요.
		const oldest = [...states.entries()].sort((a, b) => a[1].lastUpdate - b[1].lastUpdate)[0];
		if (oldest) states.delete(oldest[0]);
	}

	states.set(guildId, { state: payload, lastUpdate: Date.now() });
}

let subscriber: RedisClientType | null = null;
/** pSubscribe가 한 번이라도 완료됐는가 — 재연결 시 클라이언트가 자동 재구독하는 대상이 되는 기준 (playerHub와 같은 래치) */
let subscribeIntent = false;
/** 실제 구독 중 — 소켓 isOpen이 아니라 pSubscribe/재구독 완료 기준이에요 */
let subscribed = false;
/** stopBotProfileHub 이후 백그라운드 재시도 루프가 다시 돌지 않게 하는 래치 */
let stopped = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 연결 + 구독 1회 시도. 실패 시 지연 재시도해요 — 최초 연결 실패로 영구 미구독(재시작 필요) 상태가 되지 않게 해요.
 * (playerHub와 같은 연결 라이프사이클 — @redis/client v5 자동 재연결 + resubscribe 위임)
 */
async function attemptConnect(redisUrl: string, attempt: number): Promise<void> {
	if (stopped) return;
	const base = sharedCache.getClient();
	const client = (base ? base.duplicate() : createClient({ url: redisUrl })) as RedisClientType;
	subscriber = client;
	client.on('error', (error) => {
		subscribed = false;
		logger.error(`bot profile hub subscriber error: ${error}`);
	});
	client.on('reconnecting', () => (subscribed = false));
	client.on('end', () => (subscribed = false));
	client.on('ready', () => (subscribed = subscribeIntent));

	try {
		await client.connect();
		await client.pSubscribe(CHANNEL_PATTERN, (message, channel) => handleMessage(message, channel));
		subscribeIntent = true;
		subscribed = true;
		logger.info(`Bot profile hub subscribed to ${CHANNEL_PATTERN}`);
	} catch (error) {
		if (stopped) return;
		subscribed = false;
		subscribeIntent = false;
		subscriber = null;
		if (client.isOpen) client.destroy();
		const delay = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS);
		logger.warn(`Bot profile hub subscription failed (attempt ${attempt + 1}), retrying in ${delay}ms: ${error}`);
		retryTimer = setTimeout(() => {
			retryTimer = null;
			void attemptConnect(redisUrl, attempt + 1);
		}, delay);
	}
}

/**
 * Pub/Sub 구독자 연결을 시작해요. sharedCache 클라이언트를 duplicate해요 (RESP2 전용 연결 필요).
 * REDIS_URL이 없으면 구독 없이 인메모리만 유지해요 (모든 guild가 stale/unavailable).
 */
export async function startBotProfileHub(redisUrl: string | undefined): Promise<void> {
	if (!redisUrl) {
		logger.warn('REDIS_URL is not set, bot profile hub will have no live states (in-memory only)');
		return;
	}
	stopped = false;
	void attemptConnect(redisUrl, 0);
}

export async function stopBotProfileHub(): Promise<void> {
	stopped = true;
	if (retryTimer) {
		clearTimeout(retryTimer);
		retryTimer = null;
	}
	subscribeIntent = false;
	subscribed = false;
	if (!subscriber) return;
	const client = subscriber;
	subscriber = null;
	if (client.isReady) {
		await client.pUnsubscribe(CHANNEL_PATTERN).catch(() => undefined);
		await client.quit().catch(() => undefined);
	} else if (client.isOpen) {
		// 연결 도중엔 quit(QUIT 왕복 대기)이 멈출 수 있어 소켓을 즉시 파괴해요
		client.destroy();
	}
}

export interface BotProfileStateResponse extends BotProfileStatePayload {
	/** 마지막 갱신 기준 밀리초 — 이 값이 STALE_MS를 넘으면 상태는 참고용이에요 */
	ageMs: number;
	/** 마지막 갱신이 60초보다 오래됐어요 (봇이 이 길드를 구독/퍼블리시하지 않는 상태) */
	stale: boolean;
}

export function getBotProfile(guildId: string): BotProfileStateResponse | null {
	const entry = states.get(guildId);
	if (!entry) return null;
	const now = Date.now();
	return { ...entry.state, ageMs: now - entry.lastUpdate, stale: now - entry.lastUpdate > STALE_MS };
}

/** 관제용 — 현재 보관 중인 길드 수와 실제 구독 상태 (소켓이 아니라 pSubscribe/재구독 완료 기준) */
export function botProfileHubStatus(): { guilds: number; subscribed: boolean; staleMs: number } {
	return { guilds: states.size, subscribed, staleMs: STALE_MS };
}
