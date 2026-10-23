/**
 * 길드 데이터(채널·역할·멤버 목록) request/reply 허브 — 봇이 보유한 길드의 캐시를 requestId로 상관해 내려줘요.
 *
 * - 대시보드는 사용자 토큰으로 Discord API를 직접 호출하면 401이 나므로 봇 권한으로 우회해요.
 * - requestGuildData()가 REQUEST 채널(`sirubot:guild-data:request`)로 요청을 퍼블리시하면,
 *   해당 길드를 보유한 봇 프로세스(전용 구독자)가 RESPONSE 채널(`sirubot:guild-data:response`)로 응답해요.
 * - 이 허브는 RESPONSE 채널을 구독해 requestId로 대기 중 요청을 resolve해요. 응답이 없으면
 *   (봇이 이 길드를 보유하지 않거나 미연결) 타임아웃으로 동일하게 실패해요.
 * - 대기 요청의 용량 상한·타임아웃 회수는 공용 PendingRequestPool(@sirubot/utils)에 위임해요.
 * - REQUEST 퍼블리시는 sharedCache 클라이언트로 해요 (invalidate/bot-profile 라우트와 같은 방식).
 * - RESPONSE 구독은 pub/sub 전용 연결이 필요하므로 playerHub와 같은 연결 라이프사이클을 따라요.
 */
import { sharedCache } from '../utils/cache.ts';
import { correlateHubResponse } from '../utils/hubCorrelate.ts';
import { getLogger } from '../utils/logger.ts';
import { HubSubscriber } from '../utils/hubSubscriber.ts';
import { resolveRedisSigningKey, unwrapRedisMessage, wrapRedisMessage } from '@sirubot/utils/redisEnvelope';
import {
	GUILD_DATA_REQUEST_CHANNEL,
	GUILD_DATA_RESPONSE_CHANNEL,
	PendingRequestPool,
	guildDataResponseSchema,
	type GuildChannelItem,
	type GuildDataKind,
	type GuildDataRequest,
	type GuildDataResponse,
	type GuildMemberItem,
	type GuildRoleItem
} from '@sirubot/utils';

const logger = getLogger('guildDataHub');

/** 봇 응답 대기 타임아웃 — 봇 미보유·미연결과 응답 없음은 같은 실패로 매핑해요 */
const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;
/** 동시 대기 요청 상한 — 응답을 못 받는 요청이 pending map에 쌓이는 누수를 방지해요 */
const PENDING_LIMIT = 200;

export type GuildDataFailureReason = 'redis_unavailable' | 'timeout';
export type GuildDataResult =
	| { ok: true; channels?: GuildChannelItem[]; roles?: GuildRoleItem[]; members?: GuildMemberItem[] }
	| { ok: false; reason: GuildDataFailureReason };

/** 등록할 때 requestId에 묶어두는 요청 메타데이터 — 응답의 guildId·kind가 요청과 일치하는지 검증에 써요 */
export interface GuildDataPendingMeta {
	guildId: string;
	kind: GuildDataKind;
}

/**
 * RESPONSE 채널 raw 메시지를 대기 중 요청과 상관해요. requestId의 메타데이터와 guildId·kind가 일치하면
 * 풀을 완료하고, 그 외(잘못된 본문, 대기 중이 아닌 requestId, 불일치)는 무시해요.
 * 파싱·검증·메타 대조·결과 매핑 순서는 공용 correlateHubResponse가, 이 허브의 기준과 결과는 아래 콜백이 정해요.
 */
export function correlateGuildDataResponse(
	raw: string,
	pending: PendingRequestPool<GuildDataResult>,
	pendingMeta: Map<string, GuildDataPendingMeta>
): 'resolved' | 'unmatched' | 'malformed' {
	return correlateHubResponse<GuildDataResponse, GuildDataPendingMeta, GuildDataResult>({
		raw,
		hub: 'guild data',
		mismatch: 'guildId/kind mismatch',
		logger,
		schema: guildDataResponseSchema,
		pending,
		pendingMeta,
		matches: (response, meta) => response.guildId === meta.guildId && response.kind === meta.kind,
		toResult: (response) => {
			if (response.error) {
				// 봇이 데이터를 못 꺼낸 경우: 성공으로 보면 안 되고 실패 이유는 timeout(bot_timeout) 매핑이 유일해요.
				logger.debug(`Guild data response ${response.requestId} carried error: ${response.error}`);
				return { ok: false, reason: 'timeout' };
			}
			return { ok: true, channels: response.channels, roles: response.roles, members: response.members };
		}
	});
}

/** requestId별 대기 요청 메타데이터 — 타임아웃 회수(onTimeout)와 상관 완료(correlate)에서 함께 정리해 누수를 막아요 */
const pendingMeta = new Map<string, GuildDataPendingMeta>();

/** 동시 대기 요청 상한·타임아웃 회수는 공용 풀에 위임해요 — 봇 응답 없음과 타임아웃은 같은 실패로 매핑해요 */
const pending = new PendingRequestPool<GuildDataResult>({
	capacity: PENDING_LIMIT,
	logger,
	timeoutResult: () => ({ ok: false, reason: 'timeout' }),
	onTimeout: (requestId) => pendingMeta.delete(requestId)
});

/** Redis 메시지 서명 키 — REDIS_AUTH_KEY ?? AUTH_KEY (봇과 공유). 없으면 서명 없는 구버전 모드. */
const redisSigningKey = resolveRedisSigningKey(process.env);

/** Pub/Sub 구독자 — 공용 라이프사이클(HubSubscriber)에 연결·구독·재시도·종료를 위임해요. */
const subscriber = new HubSubscriber({
	name: 'guild data hub',
	channel: GUILD_DATA_RESPONSE_CHANNEL,
	// 응답은 서명 검증을 통과한 본문만 상관해요 — Redis에 쓸 수 있는 사람이 보내는 위조 응답을 거부해요 (SEC-006).
	onMessage: (message) => {
		const body = unwrapRedisMessage(redisSigningKey, message);
		if (body === null) {
			logger.warn('Rejected guild data response with invalid signature');
			return;
		}
		correlateGuildDataResponse(body, pending, pendingMeta);
	},
	logger
});

/**
 * RESPONSE 채널 구독자 연결을 시작해요.
 * REDIS_URL이 없으면 구독 없이 시작해요 — 요청은 redis_unavailable로 즉시 실패해요 (playerHub 선례).
 */
export async function startGuildDataHub(redisUrl: string | undefined): Promise<void> {
	if (!redisUrl) {
		logger.warn('REDIS_URL is not set, guild data hub will not receive responses (all requests fail as redis_unavailable)');
		return;
	}
	await subscriber.start(redisUrl);
}

export async function stopGuildDataHub(): Promise<void> {
	await subscriber.stop();
}

/**
 * 길드 데이터를 봇에 요청해요. Redis 클라이언트가 없으면 즉시 redis_unavailable, REQUEST 채널을
 * 퍼블리시하고 `timeoutMs`(기본 5초) 안에 응답이 없으면 timeout으로 실패해요.
 * 봇은 보유 길드에만 응답하므로 응답 없음은 봇 미보유·미연결과 같은 실패로 매핑돼요.
 * kind === 'members'일 때는 `userIds`(최대 10명)를 함께 보내 표시 정보를 조회해요.
 */
export async function requestGuildData(
	guildId: string,
	kind: GuildDataKind,
	userIds?: string[],
	timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
): Promise<GuildDataResult> {
	const client = sharedCache.getClient();
	if (!client) {
		return { ok: false, reason: 'redis_unavailable' };
	}
	const requestId = crypto.randomUUID();
	const request: GuildDataRequest = userIds ? { requestId, guildId, kind, userIds } : { requestId, guildId, kind };
	// 용량 초과 등 즉시 실패 경로에서도 onTimeout이 메타데이터를 정리할 수 있게 register 전에 심어요
	pendingMeta.set(requestId, { guildId, kind });
	const promise = pending.register(requestId, timeoutMs);
	try {
		await client.publish(GUILD_DATA_REQUEST_CHANNEL, wrapRedisMessage(redisSigningKey, request));
	} catch (error) {
		// publish 실패 — 응답이 절대 오지 않으니 즉시 실패로 정리해요
		if (pending.fail(requestId, { ok: false, reason: 'redis_unavailable' })) {
			pendingMeta.delete(requestId);
		}
		logger.warn(`Guild data request publish failed (${guildId}): ${error instanceof Error ? error.message : String(error)}`);
	}
	return promise;
}

/** 관제용 — 대기 중 요청 수와 실제 구독 상태 (소켓이 아니라 subscribe/재구독 완료 기준) */
export function guildDataHubStatus(): { pending: number; subscribed: boolean } {
	return { pending: pending.size, subscribed: subscriber.isSubscribed };
}
