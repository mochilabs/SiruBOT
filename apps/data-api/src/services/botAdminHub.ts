/**
 * 봇 관리자(운영자) 제어 request/reply 허브 — 대시보드 관리자 패널(/admin)의
 * 노드 상태 조회·노드 재연결·앱 이모지 조회/동기화·스토어 리로드 요청을 봇에 전달해 응답을 상관해요.
 */
import { getLogger } from '../utils/logger.ts';
import { createRequestReplyHub } from '../utils/requestReplyHub.ts';
import {
	botAdminRpc,
	type BotAdminEmojiItem,
	type BotAdminKind,
	type BotAdminNodeItem,
	type BotAdminReloadStore,
	type BotAdminRequest,
	type PendingRequestPool
} from '@sirubot/utils';

const logger = getLogger('botAdminHub');

const KIND_TIMEOUT_MS: Record<BotAdminKind, number> = {
	'nodes-status': 5_000,
	'node-reconnect': 8_000,
	'node-disconnect': 8_000,
	'emojis-list': 8_000,
	'emojis-sync': 20_000,
	'reload-stores': 15_000
};

const PENDING_LIMIT = 50;

export type BotAdminFailureReason = 'redis_unavailable' | 'timeout' | 'bot_error';
export type BotAdminResult =
	| {
			ok: true;
			nodes?: BotAdminNodeItem[];
			emojis?: BotAdminEmojiItem[];
			stores?: BotAdminReloadStore[];
			message?: string;
	  }
	| { ok: false; reason: BotAdminFailureReason; message: string | null };

export interface BotAdminPendingMeta {
	kind: BotAdminKind;
}

const hub = createRequestReplyHub<typeof botAdminRpc, BotAdminPendingMeta, BotAdminResult>({
	name: 'bot admin hub',
	label: 'bot admin',
	mismatch: 'kind mismatch',
	requestLabel: 'Bot admin request',
	logger,
	contract: botAdminRpc,
	capacity: PENDING_LIMIT,
	matches: (response, meta) => response.kind === meta.kind,
	toResult: (response) => {
		if (response.error) {
			return { ok: false, reason: 'bot_error', message: response.error };
		}
		return {
			ok: true,
			nodes: response.nodes,
			emojis: response.emojis,
			stores: response.stores,
			message: response.message
		};
	},
	timeoutResult: () => ({ ok: false, reason: 'timeout', message: null }),
	unavailableResult: () => ({ ok: false, reason: 'redis_unavailable', message: null })
});

export function correlateBotAdminResponse(
	raw: string,
	pending: PendingRequestPool<BotAdminResult>,
	pendingMeta: Map<string, BotAdminPendingMeta>
): 'resolved' | 'unmatched' | 'malformed' {
	return hub.correlate(raw, pending, pendingMeta);
}

export const startBotAdminHub = (redisUrl: string | undefined): Promise<void> => hub.start(redisUrl);

export const stopBotAdminHub = (): Promise<void> => hub.stop();

export function requestBotAdmin(payload: BotAdminRequest): Promise<BotAdminResult> {
	return hub.request({
		requestId: payload.requestId,
		payload,
		meta: { kind: payload.kind },
		timeoutMs: KIND_TIMEOUT_MS[payload.kind],
		logContext: payload.kind
	});
}
