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
import { getLogger } from '../utils/logger.ts';
import { createRequestReplyHub } from '../utils/requestReplyHub.ts';
import {
	PLAYER_WEB_REQUEST_CHANNEL,
	PLAYER_WEB_RESPONSE_CHANNEL,
	playerWebResponseSchema,
	type PlayerVoiceContext,
	type PlayerWebControlRequest,
	type PlayerWebKind,
	type PlayerWebPlayRequest,
	type PlayerWebResponse,
	type PlayerWebSearchRequest,
	type PlayerWebTrack,
	type PlayerWebVoiceContextRequest,
	type PendingRequestPool
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
	{ ok: true; tracks?: PlayerWebTrack[]; voice?: PlayerVoiceContext } | { ok: false; reason: PlayerWebFailureReason; message: string | null };

/** 등록할 때 requestId에 묶어두는 요청 메타데이터 — 응답의 guildId·kind가 요청과 일치하는지 검증에 써요 */
export interface PlayerWebPendingMeta {
	guildId: string;
	kind: PlayerWebKind;
}

/** 대기·상관·구독·퍼블리시 배선은 공용 팩토리가, 이 허브의 채널·기준·결과 매핑은 아래 설정이 정해요 */
const hub = createRequestReplyHub<PlayerWebResponse, PlayerWebPendingMeta, PlayerWebResult>({
	name: 'player web hub',
	label: 'player web',
	mismatch: 'guildId/kind mismatch',
	requestLabel: 'Player web request',
	logger,
	requestChannel: PLAYER_WEB_REQUEST_CHANNEL,
	responseChannel: PLAYER_WEB_RESPONSE_CHANNEL,
	responseSchema: playerWebResponseSchema,
	capacity: PENDING_LIMIT,
	matches: (response, meta) => response.guildId === meta.guildId && response.kind === meta.kind,
	toResult: (response) => {
		if (response.error) {
			// 봇이 검증 실패(음성 미접속·권한 없음·노드 없음 등)를 한국어로 실어 보낸 경우: 실제 사유를 그대로 전달해요.
			return { ok: false, reason: 'bot_error', message: response.error };
		}
		return { ok: true, tracks: response.tracks, voice: response.voice };
	},
	timeoutResult: () => ({ ok: false, reason: 'timeout', message: null }),
	unavailableResult: () => ({ ok: false, reason: 'redis_unavailable', message: null })
});

/**
 * RESPONSE 채널 raw 메시지를 대기 중 요청과 상관해요. requestId의 메타데이터와 guildId·kind가 일치하면
 * 풀을 완료하고, 그 외(잘못된 본문, 대기 중이 아닌 requestId, 불일치)는 무시해요.
 */
export function correlatePlayerWebResponse(
	raw: string,
	pending: PendingRequestPool<PlayerWebResult>,
	pendingMeta: Map<string, PlayerWebPendingMeta>
): 'resolved' | 'unmatched' | 'malformed' {
	return hub.correlate(raw, pending, pendingMeta);
}

/**
 * RESPONSE 채널 구독자 연결을 시작해요.
 * REDIS_URL이 없으면 구독 없이 시작해요 — 요청은 redis_unavailable로 즉시 실패해요 (guildDataHub 선례).
 */
export const startPlayerWebHub = (redisUrl: string | undefined): Promise<void> => hub.start(redisUrl);

export const stopPlayerWebHub = (): Promise<void> => hub.stop();

/**
 * 웹 플레이어 요청을 봇에 전달하고 응답을 기다려요. Redis 클라이언트가 없으면 즉시 redis_unavailable,
 * REQUEST 채널을 퍼블리시하고 kind별 대기 시간 안에 응답이 없으면 timeout으로 실패해요.
 * 봇은 보유 길드에만 응답하므로 응답 없음은 봇 미보유·미연결과 같은 실패로 매핑돼요.
 */
export function requestPlayerWeb(payload: PlayerWebAnyRequest): Promise<PlayerWebResult> {
	return hub.request({
		requestId: payload.requestId,
		payload,
		meta: { guildId: payload.guildId, kind: payload.kind },
		timeoutMs: KIND_TIMEOUT_MS[payload.kind],
		logContext: `${payload.guildId}, kind ${payload.kind}`
	});
}

/** 관제용 — 대기 중 요청 수와 실제 구독 상태 (소켓이 아니라 subscribe/재구독 완료 기준) */
export const playerWebHubStatus = (): { pending: number; subscribed: boolean } => hub.status();
