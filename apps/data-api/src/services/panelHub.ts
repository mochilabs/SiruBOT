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
import { sharedCache } from '../utils/cache.ts';
import { correlateHubResponse } from '../utils/hubCorrelate.ts';
import { getLogger } from '../utils/logger.ts';
import { HubSubscriber } from '../utils/hubSubscriber.ts';
import { resolveRedisSigningKey, unwrapRedisMessage, wrapRedisMessage } from '@sirubot/utils/redisEnvelope';
import {
	PANEL_POST_REQUEST_CHANNEL,
	PANEL_POST_RESPONSE_CHANNEL,
	ROLE_VALIDATION_REQUEST_CHANNEL,
	ROLE_VALIDATION_RESPONSE_CHANNEL,
	PendingRequestPool,
	panelPostResponseSchema,
	type PanelPostResponse,
	roleValidationResponseSchema,
	type RoleValidationResponse
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

/** 패널 게시 응답 상관 — guildId 일치 시 messageId를 결과로 매핑해요. */
export function correlatePanelPostResponse(
	raw: string,
	pending: PendingRequestPool<PanelPostResult>,
	pendingMeta: Map<string, PanelPendingMeta>
): 'resolved' | 'unmatched' | 'malformed' {
	return correlateHubResponse<PanelPostResponse, PanelPendingMeta, PanelPostResult>({
		raw,
		hub: 'panel post',
		mismatch: 'guildId mismatch',
		logger,
		schema: panelPostResponseSchema,
		pending,
		pendingMeta,
		matches: (response, meta) => response.guildId === meta.guildId,
		toResult: (response) => {
			if (response.error) return { ok: false, reason: 'bot_error', message: response.error };
			return { ok: true, messageId: response.messageId, channelId: response.channelId };
		}
	});
}

/** 역할 검증 응답 상관 — guildId 일치 시 invalidRoleIds를 결과로 매핑해요. */
export function correlateRoleValidationResponse(
	raw: string,
	pending: PendingRequestPool<RoleValidationResult>,
	pendingMeta: Map<string, PanelPendingMeta>
): 'resolved' | 'unmatched' | 'malformed' {
	return correlateHubResponse<RoleValidationResponse, PanelPendingMeta, RoleValidationResult>({
		raw,
		hub: 'role validation',
		mismatch: 'guildId mismatch',
		logger,
		schema: roleValidationResponseSchema,
		pending,
		pendingMeta,
		matches: (response, meta) => response.guildId === meta.guildId,
		toResult: (response) => {
			if (response.error) return { ok: false, reason: 'bot_error', message: response.error };
			return { ok: true, invalidRoleIds: response.invalidRoleIds ?? [] };
		}
	});
}

const panelPostPendingMeta = new Map<string, PanelPendingMeta>();
const roleValidationPendingMeta = new Map<string, PanelPendingMeta>();

const panelPostPending = new PendingRequestPool<PanelPostResult>({
	capacity: PENDING_LIMIT,
	logger,
	timeoutResult: () => ({ ok: false, reason: 'timeout', message: null }),
	onTimeout: (requestId) => panelPostPendingMeta.delete(requestId)
});

const roleValidationPending = new PendingRequestPool<RoleValidationResult>({
	capacity: PENDING_LIMIT,
	logger,
	timeoutResult: () => ({ ok: false, reason: 'timeout', message: null }),
	onTimeout: (requestId) => roleValidationPendingMeta.delete(requestId)
});

/** Redis 메시지 서명 키 — REDIS_AUTH_KEY ?? AUTH_KEY (봇과 공유). 없으면 서명 없는 구버전 모드. */
const redisSigningKey = resolveRedisSigningKey(process.env);

const panelPostSubscriber = new HubSubscriber({
	name: 'panel post hub',
	channel: PANEL_POST_RESPONSE_CHANNEL,
	onMessage: (message) => {
		const body = unwrapRedisMessage(redisSigningKey, message);
		if (body === null) {
			logger.warn('Rejected panel post response with invalid signature');
			return;
		}
		correlatePanelPostResponse(body, panelPostPending, panelPostPendingMeta);
	},
	logger
});

const roleValidationSubscriber = new HubSubscriber({
	name: 'role validation hub',
	channel: ROLE_VALIDATION_RESPONSE_CHANNEL,
	onMessage: (message) => {
		const body = unwrapRedisMessage(redisSigningKey, message);
		if (body === null) {
			logger.warn('Rejected role validation response with invalid signature');
			return;
		}
		correlateRoleValidationResponse(body, roleValidationPending, roleValidationPendingMeta);
	},
	logger
});

export async function startPanelHub(redisUrl: string | undefined): Promise<void> {
	if (!redisUrl) {
		logger.warn('REDIS_URL is not set, panel hub will not receive responses (all requests fail as redis_unavailable)');
		return;
	}
	await panelPostSubscriber.start(redisUrl);
	await roleValidationSubscriber.start(redisUrl);
}

export async function stopPanelHub(): Promise<void> {
	await panelPostSubscriber.stop();
	await roleValidationSubscriber.stop();
}

/**
 * 패널 게시 요청을 봇에 전달하고 응답을 기다려요. Redis 클라이언트가 없으면 즉시 redis_unavailable,
 * 응답이 없으면 timeout으로 실패해요. 봇은 보유 길드에만 응답하므로 응답 없음은 봇 미보유·미연결과 같은 실패예요.
 */
export async function requestPanelPost(payload: {
	requestId: string;
	guildId: string;
	type: 'ticket' | 'rolePanel';
	panelId?: string;
	channelId?: string;
	refresh?: boolean;
}): Promise<PanelPostResult> {
	const client = sharedCache.getClient();
	if (!client) {
		return { ok: false, reason: 'redis_unavailable', message: null };
	}
	panelPostPendingMeta.set(payload.requestId, { guildId: payload.guildId });
	const promise = panelPostPending.register(payload.requestId, TIMEOUT_MS);
	try {
		await client.publish(PANEL_POST_REQUEST_CHANNEL, wrapRedisMessage(redisSigningKey, payload));
	} catch (error) {
		if (panelPostPending.fail(payload.requestId, { ok: false, reason: 'redis_unavailable', message: null })) {
			panelPostPendingMeta.delete(payload.requestId);
		}
		logger.warn(`Panel post request publish failed (${payload.guildId}): ${error instanceof Error ? error.message : String(error)}`);
	}
	return promise;
}

/**
 * 역할 검증 요청을 봇에 전달하고 응답을 기다려요. 실패 매핑은 requestPanelPost와 같아요.
 */
export async function requestRoleValidation(payload: { requestId: string; guildId: string; roleIds: string[] }): Promise<RoleValidationResult> {
	const client = sharedCache.getClient();
	if (!client) {
		return { ok: false, reason: 'redis_unavailable', message: null };
	}
	roleValidationPendingMeta.set(payload.requestId, { guildId: payload.guildId });
	const promise = roleValidationPending.register(payload.requestId, TIMEOUT_MS);
	try {
		await client.publish(ROLE_VALIDATION_REQUEST_CHANNEL, wrapRedisMessage(redisSigningKey, payload));
	} catch (error) {
		if (roleValidationPending.fail(payload.requestId, { ok: false, reason: 'redis_unavailable', message: null })) {
			roleValidationPendingMeta.delete(payload.requestId);
		}
		logger.warn(`Role validation request publish failed (${payload.guildId}): ${error instanceof Error ? error.message : String(error)}`);
	}
	return promise;
}
