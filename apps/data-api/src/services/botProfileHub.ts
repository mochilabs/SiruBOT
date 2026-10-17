/**
 * 봇 프로필 상태 허브 — 봇 샤드들이 Redis Pub/Sub(`sirubot:bot-profile:state:{guildId}`)으로
 * 퍼블리시한 길드별 봇 닉네임·아바타 상태를 구독해 인메모리에 보관해요.
 *
 * - 구독자는 data-api가 유일해요 (봇은 퍼블리셔).
 * - playerHub와 같은 구조예요 — READY·멤버 업데이트·적용 완료 때 봇이 퍼블리시해요.
 * - 화면 조회/재시도 때 요청을 받아 봇이 Discord에서 최신 상태를 읽어 응답해요.
 * - 주기 퍼블리시는 하지 않아요 — 변경 빈도가 낮은 프로필은 필요할 때만 확인해요.
 */
import { BOT_PROFILE_REFRESH_CHANNEL, BOT_PROFILE_STATE_CHANNEL_PREFIX } from '@sirubot/utils';
import { resolveRedisSigningKey, wrapRedisMessage } from '@sirubot/utils/redisEnvelope';

import { sharedCache } from '../utils/cache.ts';
import { getLogger } from '../utils/logger.ts';
import { HubSubscriber } from '../utils/hubSubscriber.ts';

const logger = getLogger('botProfileHub');

/** 봇이 상태 조회 요청에 응답할 때까지 기다리는 시간 */
const REFRESH_TIMEOUT_MS = 5_000;
/** 길드 상태 엔트리 최대 보관 수 (장기 비활성 길드 누수 방지) */
const MAX_ENTRIES = 5_000;
/** 구독 채널 패턴 — 봇 퍼블리시어(botProfileService)와 계약이에요 */
const CHANNEL_PATTERN = `${BOT_PROFILE_STATE_CHANNEL_PREFIX}*`;

export interface BotProfileStatePayload {
	guildId: string;
	nickname: string | null;
	username: string;
	guildAvatarUrl: string | null;
	guildBannerUrl: string | null;
	globalAvatarUrl: string | null;
	canChangeNickname: boolean;
	lastApply: { ok: boolean; error: string | null; at: number } | null;
	updatedAt: number;
}

interface Entry {
	state: BotProfileStatePayload;
	lastUpdate: number;
}

interface RefreshRequest {
	promise: Promise<boolean>;
	resolve: (refreshed: boolean) => void;
	timer: ReturnType<typeof setTimeout>;
}

const states = new Map<string, Entry>();
const refreshRequests = new Map<string, RefreshRequest>();

function isNullableString(value: unknown): value is string | null {
	return typeof value === 'string' || value === null;
}

/** 퍼블리시 페이로드 검증 — malformed 메시지는 조용히 버리고 정상 메시지만 인메모리에 심어요 */
function parsePayload(message: string, guildId: string): BotProfileStatePayload | null {
	try {
		const parsed = JSON.parse(message) as Partial<BotProfileStatePayload>;
		if (typeof parsed !== 'object' || parsed === null || parsed.guildId !== guildId) return null;
		if (!isNullableString(parsed.nickname) || typeof parsed.username !== 'string') return null;
		if (!isNullableString(parsed.guildAvatarUrl) || !isNullableString(parsed.guildBannerUrl) || !isNullableString(parsed.globalAvatarUrl))
			return null;
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
			guildBannerUrl: parsed.guildBannerUrl,
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
	const refresh = refreshRequests.get(guildId);
	if (refresh) {
		clearTimeout(refresh.timer);
		refreshRequests.delete(guildId);
		refresh.resolve(true);
	}
}

/** Pub/Sub 구독자 — 공용 라이프사이클(HubSubscriber)에 연결·구독·재시도·종료를 위임해요. */
const subscriber = new HubSubscriber({
	name: 'bot profile hub',
	channel: CHANNEL_PATTERN,
	pattern: true,
	onMessage: handleMessage,
	logger
});

/**
 * Pub/Sub 구독자 연결을 시작해요.
 * REDIS_URL이 없으면 구독 없이 인메모리만 유지해요 (상태 조회 요청은 실패해요).
 */
export async function startBotProfileHub(redisUrl: string | undefined): Promise<void> {
	if (!redisUrl) {
		logger.warn('REDIS_URL is not set, bot profile hub will have no live states (in-memory only)');
		return;
	}
	await subscriber.start(redisUrl);
}

export async function stopBotProfileHub(): Promise<void> {
	await subscriber.stop();
}

export type BotProfileStateResponse = BotProfileStatePayload;

export function getBotProfile(guildId: string): BotProfileStateResponse | null {
	const entry = states.get(guildId);
	if (!entry) return null;
	return entry.state;
}

/** 화면 조회/재시도 시 한 번만 봇에 최신 상태를 요청해요. 봇 응답이 없으면 기존 캐시는 유지해요. */
export async function refreshBotProfile(guildId: string): Promise<boolean> {
	const client = sharedCache.getClient();
	if (!client) return false;
	const existing = refreshRequests.get(guildId);
	if (existing) return existing.promise;

	let resolve!: (refreshed: boolean) => void;
	const response = new Promise<boolean>((res) => {
		resolve = res;
	});
	const timer = setTimeout(() => {
		refreshRequests.delete(guildId);
		resolve(false);
	}, REFRESH_TIMEOUT_MS);
	refreshRequests.set(guildId, { promise: response, resolve, timer });
	try {
		await client.publish(BOT_PROFILE_REFRESH_CHANNEL, wrapRedisMessage(resolveRedisSigningKey(process.env), { guildId }));
	} catch (error) {
		clearTimeout(timer);
		refreshRequests.delete(guildId);
		logger.warn(`Bot profile refresh request publish failed (${guildId}): ${error instanceof Error ? error.message : String(error)}`);
		resolve(false);
	}
	return response;
}

/** 관제용 — 현재 보관 중인 길드 수와 실제 구독 상태 (소켓이 아니라 pSubscribe/재구독 완료 기준) */
export function botProfileHubStatus(): { guilds: number; subscribed: boolean } {
	return { guilds: states.size, subscribed: subscriber.isSubscribed };
}
