/**
 * 패널 게시·역할 검증 request/reply 허브 — 대시보드의 직접 게시/저장 전 검증 요청을 봇에 전달해 응답을 상관해요.
 *
 * - 패널 게시(티켓·역할 패널): 대시보드가 `/v1/internal/panel/post`로 요청하면 REQUEST 채널
 *   (`sirubot:panel-post:request`)로 {requestId, guildId, type, panelId?, channelId}를 브로드캐스트하고,
 *   해당 길드를 보유한 봇이 게시한 뒤 RESPONSE 채널로 messageId를 응답해요.
 * - 역할 검증: `/v1/internal/role-panel/validate-roles` → REQUEST 채널(`sirubot:role-validation:request`)로
 *   {requestId, guildId, roleIds}를 브로드캐스트하고, 봇이 invalidRoleIds를 응답해요.
 *
 * 두 흐름이 같은 request/reply 구조를 쓰므로 한 허브 파일에서 채널·스키마만 갈라 처리해요.
 * REQUEST 퍼블리시는 sharedCache, RESPONSE 구독은 pub/sub 전용 연결(HubSubscriber)로 해요.
 */
import { getLogger } from '../utils/logger.ts';
import { createRequestReplyHub } from '../utils/requestReplyHub.ts';
import {
	PANEL_POST_REQUEST_CHANNEL,
	PANEL_POST_RESPONSE_CHANNEL,
	ROLE_VALIDATION_REQUEST_CHANNEL,
	ROLE_VALIDATION_RESPONSE_CHANNEL,
	panelPostResponseSchema,
	type PanelPostResponse,
	roleValidationResponseSchema,
	type RoleValidationResponse,
	type PendingRequestPool
} from '@sirubot/utils';

const logger = getLogger('panelHub');

/** 봇 응답 대기 시간 — 메시지 게시·역할 검증까지 몇 초 내외라 여유를 둬요 */
const TIMEOUT_MS = 10_000;
/** 동시 대기 요청 상한 — 응답을 못 받는 요청이 pending map에 쌓이는 누수를 방지해요 */
const PENDING_LIMIT = 50;

export type PanelRelayFailureReason = 'redis_unavailable' | 'timeout' | 'bot_error';

export type PanelPostResult =
	{ ok: true; messageId?: string; channelId?: string } | { ok: false; reason: PanelRelayFailureReason; message: string | null };
export type RoleValidationResult = { ok: true; invalidRoleIds: string[] } | { ok: false; reason: PanelRelayFailureReason; message: string | null };

interface PanelPendingMeta {
	guildId: string;
}

/** 패널 게시 — guildId 일치 시 messageId를 결과로 매핑해요. */
const panelPostHub = createRequestReplyHub<PanelPostResponse, PanelPendingMeta, PanelPostResult>({
	name: 'panel post hub',
	label: 'panel post',
	mismatch: 'guildId mismatch',
	requestLabel: 'Panel post request',
	logger,
	requestChannel: PANEL_POST_REQUEST_CHANNEL,
	responseChannel: PANEL_POST_RESPONSE_CHANNEL,
	responseSchema: panelPostResponseSchema,
	capacity: PENDING_LIMIT,
	matches: (response, meta) => response.guildId === meta.guildId,
	toResult: (response) => {
		if (response.error) return { ok: false, reason: 'bot_error', message: response.error };
		return { ok: true, messageId: response.messageId, channelId: response.channelId };
	},
	timeoutResult: () => ({ ok: false, reason: 'timeout', message: null }),
	unavailableResult: () => ({ ok: false, reason: 'redis_unavailable', message: null })
});

/** 역할 검증 — guildId 일치 시 invalidRoleIds를 결과로 매핑해요. */
const roleValidationHub = createRequestReplyHub<RoleValidationResponse, PanelPendingMeta, RoleValidationResult>({
	name: 'role validation hub',
	label: 'role validation',
	mismatch: 'guildId mismatch',
	requestLabel: 'Role validation request',
	logger,
	requestChannel: ROLE_VALIDATION_REQUEST_CHANNEL,
	responseChannel: ROLE_VALIDATION_RESPONSE_CHANNEL,
	responseSchema: roleValidationResponseSchema,
	capacity: PENDING_LIMIT,
	matches: (response, meta) => response.guildId === meta.guildId,
	toResult: (response) => {
		if (response.error) return { ok: false, reason: 'bot_error', message: response.error };
		return { ok: true, invalidRoleIds: response.invalidRoleIds ?? [] };
	},
	timeoutResult: () => ({ ok: false, reason: 'timeout', message: null }),
	unavailableResult: () => ({ ok: false, reason: 'redis_unavailable', message: null })
});

/** 패널 게시 응답 상관 — guildId 일치 시 messageId를 결과로 매핑해요. */
export function correlatePanelPostResponse(
	raw: string,
	pending: PendingRequestPool<PanelPostResult>,
	pendingMeta: Map<string, PanelPendingMeta>
): 'resolved' | 'unmatched' | 'malformed' {
	return panelPostHub.correlate(raw, pending, pendingMeta);
}

/** 역할 검증 응답 상관 — guildId 일치 시 invalidRoleIds를 결과로 매핑해요. */
export function correlateRoleValidationResponse(
	raw: string,
	pending: PendingRequestPool<RoleValidationResult>,
	pendingMeta: Map<string, PanelPendingMeta>
): 'resolved' | 'unmatched' | 'malformed' {
	return roleValidationHub.correlate(raw, pending, pendingMeta);
}

export async function startPanelHub(redisUrl: string | undefined): Promise<void> {
	if (!redisUrl) {
		logger.warn('REDIS_URL is not set, panel hub will not receive responses (all requests fail as redis_unavailable)');
		return;
	}
	await panelPostHub.start(redisUrl);
	await roleValidationHub.start(redisUrl);
}

export async function stopPanelHub(): Promise<void> {
	await panelPostHub.stop();
	await roleValidationHub.stop();
}

/**
 * 패널 게시 요청을 봇에 전달하고 응답을 기다려요. Redis 클라이언트가 없으면 즉시 redis_unavailable,
 * 응답이 없으면 timeout으로 실패해요. 봇은 보유 길드에만 응답하므로 응답 없음은 봇 미보유·미연결과 같은 실패예요.
 */
export function requestPanelPost(payload: {
	requestId: string;
	guildId: string;
	type: 'ticket' | 'rolePanel';
	panelId?: string;
	channelId?: string;
	refresh?: boolean;
}): Promise<PanelPostResult> {
	return panelPostHub.request({
		requestId: payload.requestId,
		payload,
		meta: { guildId: payload.guildId },
		timeoutMs: TIMEOUT_MS,
		logContext: payload.guildId
	});
}

/**
 * 역할 검증 요청을 봇에 전달하고 응답을 기다려요. 실패 매핑은 requestPanelPost와 같아요.
 */
export function requestRoleValidation(payload: { requestId: string; guildId: string; roleIds: string[] }): Promise<RoleValidationResult> {
	return roleValidationHub.request({
		requestId: payload.requestId,
		payload,
		meta: { guildId: payload.guildId },
		timeoutMs: TIMEOUT_MS,
		logContext: payload.guildId
	});
}
