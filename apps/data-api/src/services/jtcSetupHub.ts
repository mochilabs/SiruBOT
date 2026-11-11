/**
 * JTC 마커 채널 셋업 request/reply 허브 — 대시보드의 마커 채널 생성·이동 요청을 봇에 전달해 응답을 상관해요.
 *
 * - 마커 채널 생성·이동은 봇 토큰으로만 가능해요 (유저 OAuth 토큰에는 길드 채널 관리 권한이 없어요) —
 *   guildData·playerWeb처럼 request/reply로 우회해요 (shape는 @sirubot/utils의 jtcSetup 스키마).
 * - requestJtcSetup()가 REQUEST 채널(`sirubot:jtc-setup:request`)로 요청을 퍼블리시하면,
 *   해당 길드를 보유한 봇 프로세스(전용 구독자)가 tempVoiceService로 수행하고
 *   RESPONSE 채널(`sirubot:jtc-setup:response`)로 응답해요.
 * - 이 허브는 RESPONSE 채널을 구독해 requestId로 대기 중 요청을 resolve해요. 응답이 없으면
 *   (봇이 이 길드를 보유하지 않거나 미연결) 타임아웃으로 동일하게 실패해요.
 * - 봇이 error 메시지(한국어)를 실어도 그대로 전달해요 — 실제 실패 사유를 사용자에게 보여줄 수 있어요.
 * - 대기 요청의 용량 상한·타임아웃 회수는 공용 PendingRequestPool(@sirubot/utils)에 위임해요.
 * - REQUEST 퍼블리시는 sharedCache 클라이언트로 해요 (guildData·playerWeb과 같은 방식).
 * - RESPONSE 구독은 pub/sub 전용 연결이 필요하므로 guildDataHub와 같은 연결 라이프사이클을 따라요.
 */
import { createRequestReplyHub } from '../utils/requestReplyHub.ts';
import { getLogger } from '../utils/logger.ts';
import {
	JTC_SETUP_REQUEST_CHANNEL,
	JTC_SETUP_RESPONSE_CHANNEL,
	jtcSetupResponseSchema,
	type JtcSetupResponse,
	type PendingRequestPool
} from '@sirubot/utils';

const logger = getLogger('jtcSetupHub');

/** 봇 응답 대기 시간 — 채널 이동·생성·DB 저장까지 몇 초 내외라 여유를 둬요 */
const SETUP_TIMEOUT_MS = 10_000;
/** 동시 대기 요청 상한 — 응답을 못 받는 요청이 pending map에 쌓이는 누수를 방지해요 */
const PENDING_LIMIT = 50;

export type JtcSetupFailureReason = 'redis_unavailable' | 'timeout' | 'bot_error';
export type JtcSetupResult = { ok: true; markerChannelId?: string } | { ok: false; reason: JtcSetupFailureReason; message: string | null };

/** 등록할 때 requestId에 묶어두는 요청 메타데이터 — 응답의 guildId가 요청과 일치하는지 검증에 써요 */
export interface JtcSetupPendingMeta {
	guildId: string;
}

/** 대기·상관·구독·퍼블리시 배선은 공용 팩토리가, 이 허브의 채널·기준·결과 매핑은 아래 설정이 정해요 */
const hub = createRequestReplyHub<JtcSetupResponse, JtcSetupPendingMeta, JtcSetupResult>({
	name: 'jtc setup hub',
	label: 'jtc setup',
	mismatch: 'guildId mismatch',
	requestLabel: 'JTC setup request',
	logger,
	requestChannel: JTC_SETUP_REQUEST_CHANNEL,
	responseChannel: JTC_SETUP_RESPONSE_CHANNEL,
	responseSchema: jtcSetupResponseSchema,
	capacity: PENDING_LIMIT,
	matches: (response, meta) => response.guildId === meta.guildId,
	toResult: (response) => {
		if (response.error) {
			// 봇이 검증 실패(카테고리 아님·권한 부족 등)를 한국어로 실어 보낸 경우: 실제 사유를 그대로 전달해요.
			return { ok: false, reason: 'bot_error', message: response.error };
		}
		return { ok: true, markerChannelId: response.markerChannelId };
	},
	timeoutResult: () => ({ ok: false, reason: 'timeout', message: null }),
	unavailableResult: () => ({ ok: false, reason: 'redis_unavailable', message: null })
});

/**
 * RESPONSE 채널 raw 메시지를 대기 중 요청과 상관해요. requestId의 메타데이터와 guildId가 일치하면
 * 풀을 완료하고, 그 외(잘못된 본문, 대기 중이 아닌 requestId, 불일치)는 무시해요.
 */
export function correlateJtcSetupResponse(
	raw: string,
	pending: PendingRequestPool<JtcSetupResult>,
	pendingMeta: Map<string, JtcSetupPendingMeta>
): 'resolved' | 'unmatched' | 'malformed' {
	return hub.correlate(raw, pending, pendingMeta);
}

/**
 * RESPONSE 채널 구독자 연결을 시작해요.
 * REDIS_URL이 없으면 구독 없이 시작해요 — 요청은 redis_unavailable로 즉시 실패해요 (guildDataHub 선례).
 */
export const startJtcSetupHub = (redisUrl: string | undefined): Promise<void> => hub.start(redisUrl);

export const stopJtcSetupHub = (): Promise<void> => hub.stop();

/**
 * JTC 마커 채널 셋업 요청을 봇에 전달하고 응답을 기다려요. Redis 클라이언트가 없으면 즉시 redis_unavailable,
 * REQUEST 채널을 퍼블리시하고 대기 시간 안에 응답이 없으면 timeout으로 실패해요.
 * 봇은 보유 길드에만 응답하므로 응답 없음은 봇 미보유·미연결과 같은 실패로 매핑돼요.
 */
export function requestJtcSetup(payload: { requestId: string; guildId: string; userId: string; categoryId: string }): Promise<JtcSetupResult> {
	return hub.request({
		requestId: payload.requestId,
		payload,
		meta: { guildId: payload.guildId },
		timeoutMs: SETUP_TIMEOUT_MS,
		logContext: payload.guildId
	});
}
