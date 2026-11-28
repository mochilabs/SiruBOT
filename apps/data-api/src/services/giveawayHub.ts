import { giveawayManageRpc, type GiveawayManageRequest } from '@sirubot/utils';
import { getLogger } from '../utils/logger.ts';
import { createRequestReplyHub } from '../utils/requestReplyHub.ts';

const logger = getLogger('giveawayHub');

const TIMEOUT_MS = 15_000;
const PENDING_LIMIT = 50;

export type GiveawayRelayFailureReason = 'redis_unavailable' | 'timeout' | 'bot_error';

export type GiveawayManageResult =
	{ ok: true; giveawayId?: string; winnerIds?: string[] } | { ok: false; reason: GiveawayRelayFailureReason; message: string | null };

const giveawayHub = createRequestReplyHub<typeof giveawayManageRpc, { guildId: string }, GiveawayManageResult>({
	name: 'giveaway manage hub',
	label: 'giveaway manage',
	mismatch: 'guildId mismatch',
	requestLabel: 'Giveaway manage request',
	logger,
	contract: giveawayManageRpc,
	capacity: PENDING_LIMIT,
	matches: (response, meta) => response.guildId === meta.guildId,
	toResult: (response) => {
		if (response.error) return { ok: false, reason: 'bot_error', message: response.error };
		return { ok: true, giveawayId: response.giveawayId, winnerIds: response.winnerIds };
	},
	timeoutResult: () => ({ ok: false, reason: 'timeout', message: null }),
	unavailableResult: () => ({ ok: false, reason: 'redis_unavailable', message: null })
});

export async function startGiveawayHub(redisUrl: string | undefined): Promise<void> {
	if (!redisUrl) {
		logger.warn('REDIS_URL is not set, giveaway hub will not receive responses (all requests fail as redis_unavailable)');
		return;
	}
	await giveawayHub.start(redisUrl);
}

export async function stopGiveawayHub(): Promise<void> {
	await giveawayHub.stop();
}

export function requestGiveawayManage(payload: GiveawayManageRequest): Promise<GiveawayManageResult> {
	return giveawayHub.request({
		requestId: payload.requestId,
		payload,
		meta: { guildId: payload.guildId },
		timeoutMs: TIMEOUT_MS,
		logContext: payload.guildId
	});
}
