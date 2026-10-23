/**
 * 웹 플레이어 request/reply 허브 — 대시보드의 검색·재생·제어·음성 상태 요청을 봇에 전달해 응답을 상관해요.
 *
 * - 요청자의 음성 채널과 관리자/DJ 권한은 봇 캐시로만 해석할 수 있으므로 guildData 조회와 같은
 *   request/reply(shape는 @sirubot/utils의 playerWeb 스키마)로 우회해요.
 * - requestPlayerWeb()가 REQUEST 채널(`sirubot:player-web:request`)로 요청을 퍼블리시하면,
 *   해당 길드를 보유한 봇 프로세스(전용 구독자)가 RESPONSE 채널(`sirubot:player-web:response`)로 응답해요.
 * - 이 허브는 RESPONSE 채널을 구독해 requestId로 대기 중 요청을 resolve해요. 응답이 없으면
 *   (봇이 이 길드를 보유하지 않거나 미연결) 타임아웃으로 동일하게 실패해요.
 * - 봇이 error 메시지(한국어)를 실어도 그대로 전달해요 — 실제 실패 사유를 사용자에게 보여줄 수 있어요.
 * - 대기 요청의 용량 상한·타임아웃 회수는 공용 PendingRequestPool(@sirubot/utils)에 위임해요.
 * - REQUEST 퍼블리시는 sharedCache 클라이언트로 해요 (guildData와 같은 방식).
 * - RESPONSE 구독은 pub/sub 전용 연결이 필요하므로 guildDataHub와 같은 연결 라이프사이클을 따라요.
 */
import { sharedCache } from '../utils/cache.ts';
import { correlateHubResponse } from '../utils/hubCorrelate.ts';
import { getLogger } from '../utils/logger.ts';
import { HubSubscriber } from '../utils/hubSubscriber.ts';
import { resolveRedisSigningKey, unwrapRedisMessage, wrapRedisMessage } from '@sirubot/utils/redisEnvelope';
import {
	PLAYER_WEB_REQUEST_CHANNEL,
	PLAYER_WEB_RESPONSE_CHANNEL,
	PendingRequestPool,
	playerWebResponseSchema,
	type PlayerVoiceContext,
	type PlayerWebControlRequest,
	type PlayerWebKind,
	type PlayerWebPlayRequest,
	type PlayerWebResponse,
	type PlayerWebSearchRequest,
	type PlayerWebTrack,
	type PlayerWebVoiceContextRequest
} from '@sirubot/utils';

/** kind별 요청의 유니언 — 초과 속성 검사를 만족시키기 위해 라우트가 실제 페이로드 형태를 그대로 전달해요 */
export type PlayerWebAnyRequest = PlayerWebSearchRequest | PlayerWebPlayRequest | PlayerWebControlRequest | PlayerWebVoiceContextRequest;

const logger = getLogger('playerWebHub');

/** kind별 봇 응답 대기 시간 — 검색(노드 왕복)·재생(검색+접속+큐잉)은 제어/상태 조회보다 여유를 둬요 */
const KIND_TIMEOUT_MS: Record<PlayerWebKind, number> = {
	search: 10_000,
	play: 12_000,
	control: 6_000,
	'voice-context': 4_000
};
/** 동시 대기 요청 상한 — 응답을 못 받는 요청이 pending map에 쌓이는 누수를 방지해요 */
const PENDING_LIMIT = 200;

export type PlayerWebFailureReason = 'redis_unavailable' | 'timeout' | 'bot_error';
export type PlayerWebResult =
	| { ok: true; tracks?: PlayerWebTrack[]; voice?: PlayerVoiceContext }
	| { ok: false; reason: PlayerWebFailureReason; message: string | null };

/** 등록할 때 requestId에 묶어두는 요청 메타데이터 — 응답의 guildId·kind가 요청과 일치하는지 검증에 써요 */
export interface PlayerWebPendingMeta {
	guildId: string;
	kind: PlayerWebKind;
}

/**
 * RESPONSE 채널 raw 메시지를 대기 중 요청과 상관해요. requestId의 메타데이터와 guildId·kind가 일치하면
 * 풀을 완료하고, 그 외(잘못된 본문, 대기 중이 아닌 requestId, 불일치)는 무시해요.
 * 파싱·검증·메타 대조·결과 매핑 순서는 공용 correlateHubResponse가, 이 허브의 기준과 결과는 아래 콜백이 정해요.
 */
export function correlatePlayerWebResponse(
	raw: string,
	pending: PendingRequestPool<PlayerWebResult>,
	pendingMeta: Map<string, PlayerWebPendingMeta>
): 'resolved' | 'unmatched' | 'malformed' {
	return correlateHubResponse<PlayerWebResponse, PlayerWebPendingMeta, PlayerWebResult>({
		raw,
		hub: 'player web',
		mismatch: 'guildId/kind mismatch',
		logger,
		schema: playerWebResponseSchema,
		pending,
		pendingMeta,
		matches: (response, meta) => response.guildId === meta.guildId && response.kind === meta.kind,
		toResult: (response) => {
			if (response.error) {
				// 봇이 검증 실패(음성 미접속·권한 없음·노드 없음 등)를 한국어로 실어 보낸 경우: 실제 사유를 그대로 전달해요.
				return { ok: false, reason: 'bot_error', message: response.error };
			}
			return { ok: true, tracks: response.tracks, voice: response.voice };
		}
	});
}

/** requestId별 대기 요청 메타데이터 — 타임아웃 회수(onTimeout)와 상관 완료(correlate)에서 함께 정리해 누수를 막아요 */
const pendingMeta = new Map<string, PlayerWebPendingMeta>();

/** 동시 대기 요청 상한·타임아웃 회수는 공용 풀에 위임해요 — 봇 응답 없음과 타임아웃은 같은 실패로 매핑해요 */
const pending = new PendingRequestPool<PlayerWebResult>({
	capacity: PENDING_LIMIT,
	logger,
	timeoutResult: () => ({ ok: false, reason: 'timeout', message: null }),
	onTimeout: (requestId) => pendingMeta.delete(requestId)
});

/** Redis 메시지 서명 키 — REDIS_AUTH_KEY ?? AUTH_KEY (봇과 공유). 없으면 서명 없는 구버전 모드. */
const redisSigningKey = resolveRedisSigningKey(process.env);

/** Pub/Sub 구독자 — 공용 라이프사이클(HubSubscriber)에 연결·구독·재시도·종료를 위임해요. */
const subscriber = new HubSubscriber({
	name: 'player web hub',
	channel: PLAYER_WEB_RESPONSE_CHANNEL,
	// 응답은 서명 검증을 통과한 본문만 상관해요 — 사칭 userId 응답 등 Redis 경유 위조를 거부해요 (SEC-006).
	onMessage: (message) => {
		const body = unwrapRedisMessage(redisSigningKey, message);
		if (body === null) {
			logger.warn('Rejected player web response with invalid signature');
			return;
		}
		correlatePlayerWebResponse(body, pending, pendingMeta);
	},
	logger
});

/**
 * RESPONSE 채널 구독자 연결을 시작해요.
 * REDIS_URL이 없으면 구독 없이 시작해요 — 요청은 redis_unavailable로 즉시 실패해요 (guildDataHub 선례).
 */
export async function startPlayerWebHub(redisUrl: string | undefined): Promise<void> {
	if (!redisUrl) {
		logger.warn('REDIS_URL is not set, player web hub will not receive responses (all requests fail as redis_unavailable)');
		return;
	}
	await subscriber.start(redisUrl);
}

export async function stopPlayerWebHub(): Promise<void> {
	await subscriber.stop();
}

/**
 * 웹 플레이어 요청을 봇에 전달하고 응답을 기다려요. Redis 클라이언트가 없으면 즉시 redis_unavailable,
 * REQUEST 채널을 퍼블리시하고 kind별 대기 시간 안에 응답이 없으면 timeout으로 실패해요.
 * 봇은 보유 길드에만 응답하므로 응답 없음은 봇 미보유·미연결과 같은 실패로 매핑돼요.
 */
export async function requestPlayerWeb(payload: PlayerWebAnyRequest): Promise<PlayerWebResult> {
	const client = sharedCache.getClient();
	if (!client) {
		return { ok: false, reason: 'redis_unavailable', message: null };
	}
	// 용량 초과 등 즉시 실패 경로에서도 onTimeout이 메타데이터를 정리할 수 있게 register 전에 심어요
	pendingMeta.set(payload.requestId, { guildId: payload.guildId, kind: payload.kind });
	const promise = pending.register(payload.requestId, KIND_TIMEOUT_MS[payload.kind]);
	try {
		await client.publish(PLAYER_WEB_REQUEST_CHANNEL, wrapRedisMessage(redisSigningKey, payload));
	} catch (error) {
		// publish 실패 — 응답이 절대 오지 않으니 즉시 실패로 정리해요
		if (pending.fail(payload.requestId, { ok: false, reason: 'redis_unavailable', message: null })) {
			pendingMeta.delete(payload.requestId);
		}
		logger.warn(
			`Player web request publish failed (${payload.guildId}, kind ${payload.kind}): ${error instanceof Error ? error.message : String(error)}`
		);
	}
	return promise;
}

/** 관제용 — 대기 중 요청 수와 실제 구독 상태 (소켓이 아니라 subscribe/재구독 완료 기준) */
export function playerWebHubStatus(): { pending: number; subscribed: boolean } {
	return { pending: pending.size, subscribed: subscriber.isSubscribed };
}
