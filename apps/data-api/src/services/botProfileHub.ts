/**
 * 봇 프로필 상태 허브 — 봇 샤드들이 Redis Pub/Sub(`sirubot:bot-profile:state:{guildId}`)으로
 * 퍼블리시한 길드별 봇 닉네임·아바타 상태를 구독해 인메모리에 보관해요.
 *
 * - 구독자는 data-api가 유일해요 (봇은 퍼블리셔).
 * - playerHub와 같은 구조예요 — READY·멤버 업데이트·적용 완료 때 봇이 퍼블리시해요.
 * - 화면 조회/재시도 때 요청을 받아 봇이 Discord에서 최신 상태를 읽어 응답해요.
 * - 주기 퍼블리시는 하지 않아요 — 변경 빈도가 낮은 프로필은 필요할 때만 확인해요.
 */
import { z } from 'zod';
import { BOT_PROFILE_REFRESH_CHANNEL, BOT_PROFILE_STATE_CHANNEL_PREFIX } from '@sirubot/utils';
import { resolveRedisSigningKey, unwrapRedisMessage, wrapRedisMessage } from '@sirubot/utils/redisEnvelope';

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

/**
 * 봇이 state 채널로 퍼블리시하는 길드별 봇 프로필 상태 — 봇의 BotProfileState와 같은 계약이에요.
 * 형태 검증은 이 zod 스키마가 단일 소스예요 (필드 추가 시 무시되지 않게).
 */
export const botProfileStateSchema = z.object({
	guildId: z.string().min(1).max(32),
	/** 현재 길드 닉네임 — null이면 사용자명으로 표시 중이에요 */
	nickname: z.string().nullable(),
	/** 봇 사용자명 — 닉네임 초기화 시 표시할 기본값이에요 */
	username: z.string(),
	/** 길드 전용 아바타 URL — 설정 안 됐으면 null (패널은 전역 아바타를 보여줘요) */
	guildAvatarUrl: z.string().nullable(),
	/** 길드 전용 배너 URL — 설정 안 됐으면 null */
	guildBannerUrl: z.string().nullable(),
	/** 전역(앱) 아바타 URL */
	globalAvatarUrl: z.string().nullable(),
	/** 닉네임 변경 가능 여부 — CHANGE_NICKNAME 또는 MANAGE_NICKNAMES */
	canChangeNickname: z.boolean(),
	/** 마지막 적용 시도 결과 — 시도가 없으면 null */
	lastApply: z.object({ ok: z.boolean(), error: z.string().nullable(), at: z.number() }).nullable().default(null),
	updatedAt: z.number()
});
export type BotProfileStatePayload = z.infer<typeof botProfileStateSchema>;

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

/** 퍼블리시 페이로드 검증 — malformed 메시지는 조용히 버리고 정상 메시지만 인메모리에 심어요 */
function parsePayload(message: string, guildId: string): BotProfileStatePayload | null {
	try {
		const result = botProfileStateSchema.safeParse(JSON.parse(message));
		if (!result.success) {
			logger.debug(
				`Malformed bot profile state from ${BOT_PROFILE_STATE_CHANNEL_PREFIX}${guildId}: ${result.error.issues[0]?.message ?? 'invalid shape'}`
			);
			return null;
		}
		// 채널의 길드와 다른 페이로드는 무시해요 — 다른 길드 상태가 엉뚱한 엔트리에 심기지 않게.
		if (result.data.guildId !== guildId) return null;
		return result.data;
	} catch (error) {
		logger.debug(
			`Malformed bot profile state from ${BOT_PROFILE_STATE_CHANNEL_PREFIX}${guildId}: ${
				error instanceof Error ? error.message : String(error)
			}`
		);
		return null;
	}
}

/**
 * Pub/Sub 메시지 처리 — 서명 검증(SEC-006) 후 페이로드를 보관하고, 대기 중이던 refresh 요청을 완료해요.
 * 유닛 테스트가 직접 호출할 수 있게 내보내요 (다루는 게 모듈 states 맵뿐이라 Redis 연결 없이도 검증돼요).
 */
export function handleBotProfileStateMessage(message: string, channel: string): void {
	if (!channel.startsWith(BOT_PROFILE_STATE_CHANNEL_PREFIX)) return;
	const guildId = channel.slice(BOT_PROFILE_STATE_CHANNEL_PREFIX.length);
	if (!guildId) return;

	// 서명 키는 REDIS_AUTH_KEY ?? AUTH_KEY (봇과 공유). 매 메시지마다 읽어 테스트에서 환경을 스왑할 수 있게 해요.
	// 키가 있는 환경에서는 서명 봉투를 검증해 무서명 위조 프레임을 거부해요 (SEC-006, guildDataHub와 동일 계약).
	const body = unwrapRedisMessage(resolveRedisSigningKey(process.env), message);
	if (body === null) {
		logger.warn(`Rejected bot profile state from ${channel} with invalid signature`);
		return;
	}

	const payload = parsePayload(body, guildId);
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
	onMessage: handleBotProfileStateMessage,
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
