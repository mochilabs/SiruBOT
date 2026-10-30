/**
 * 봇 관리자(운영자) 제어 request/reply 허브 — 대시보드 관리자 패널(/admin)의
 * 노드 상태 조회·노드 재연결·앱 이모지 조회/동기화·스토어 리로드 요청을 봇에 전달해 응답을 상관해요.
 */
import { sharedCache } from '../utils/cache.ts';
import { correlateHubResponse } from '../utils/hubCorrelate.ts';
import { getLogger } from '../utils/logger.ts';
import { HubSubscriber } from '../utils/hubSubscriber.ts';
import { resolveRedisSigningKey, unwrapRedisMessage, wrapRedisMessage } from '@sirubot/utils/redisEnvelope';
import {
	BOT_ADMIN_REQUEST_CHANNEL,
	BOT_ADMIN_RESPONSE_CHANNEL,
	PendingRequestPool,
	botAdminResponseSchema,
	type BotAdminEmojiItem,
	type BotAdminKind,
	type BotAdminNodeItem,
	type BotAdminReloadStore,
	type BotAdminRequest,
	type BotAdminResponse
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

export function correlateBotAdminResponse(
	raw: string,
	pending: PendingRequestPool<BotAdminResult>,
	pendingMeta: Map<string, BotAdminPendingMeta>
): 'resolved' | 'unmatched' | 'malformed' {
	return correlateHubResponse<BotAdminResponse, BotAdminPendingMeta, BotAdminResult>({
		raw,
		hub: 'bot admin',
		mismatch: 'kind mismatch',
		logger,
		schema: botAdminResponseSchema,
		pending,
		pendingMeta,
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
		}
	});
}

const pendingMeta = new Map<string, BotAdminPendingMeta>();

const pending = new PendingRequestPool<BotAdminResult>({
	capacity: PENDING_LIMIT,
	logger,
	timeoutResult: () => ({ ok: false, reason: 'timeout', message: null }),
	onTimeout: (requestId) => pendingMeta.delete(requestId)
});

const redisSigningKey = resolveRedisSigningKey(process.env);

const subscriber = new HubSubscriber({
	name: 'bot admin hub',
	channel: BOT_ADMIN_RESPONSE_CHANNEL,
	onMessage: (message) => {
		const body = unwrapRedisMessage(redisSigningKey, message);
		if (body === null) {
			logger.warn('Rejected bot admin response with invalid signature');
			return;
		}
		correlateBotAdminResponse(body, pending, pendingMeta);
	},
	logger
});

export async function startBotAdminHub(redisUrl: string | undefined): Promise<void> {
	if (!redisUrl) {
		logger.warn('REDIS_URL is not set, bot admin hub will not receive responses (all requests fail as redis_unavailable)');
		return;
	}
	await subscriber.start(redisUrl);
}

export async function stopBotAdminHub(): Promise<void> {
	await subscriber.stop();
}

export async function requestBotAdmin(payload: BotAdminRequest): Promise<BotAdminResult> {
	const client = sharedCache.getClient();
	if (!client) {
		return { ok: false, reason: 'redis_unavailable', message: null };
	}
	pendingMeta.set(payload.requestId, { kind: payload.kind });
	const promise = pending.register(payload.requestId, KIND_TIMEOUT_MS[payload.kind]);
	try {
		await client.publish(BOT_ADMIN_REQUEST_CHANNEL, wrapRedisMessage(redisSigningKey, payload));
	} catch (error) {
		if (pending.fail(payload.requestId, { ok: false, reason: 'redis_unavailable', message: null })) {
			pendingMeta.delete(payload.requestId);
		}
		logger.warn(`Bot admin request publish failed (${payload.kind}): ${error instanceof Error ? error.message : String(error)}`);
	}
	return promise;
}
