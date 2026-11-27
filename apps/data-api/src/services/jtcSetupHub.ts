import { createRequestReplyHub } from '../utils/requestReplyHub.ts';
import { getLogger } from '../utils/logger.ts';
import { jtcSetupRpc } from '@sirubot/utils';

const logger = getLogger('jtcSetupHub');

const SETUP_TIMEOUT_MS = 10_000;
const PENDING_LIMIT = 50;

export type JtcSetupFailureReason = 'redis_unavailable' | 'timeout' | 'bot_error';
export type JtcSetupResult = { ok: true; markerChannelId?: string } | { ok: false; reason: JtcSetupFailureReason; message: string | null };

export interface JtcSetupPendingMeta {
	guildId: string;
}

export const hub = createRequestReplyHub<typeof jtcSetupRpc, JtcSetupPendingMeta, JtcSetupResult>({
	name: 'jtc setup hub',
	label: 'jtc setup',
	mismatch: 'guildId mismatch',
	requestLabel: 'JTC setup request',
	logger,
	contract: jtcSetupRpc,
	capacity: PENDING_LIMIT,
	matches: (response, meta) => response.guildId === meta.guildId,
	toResult: (response) => {
		if (response.error) {
			return { ok: false, reason: 'bot_error', message: response.error };
		}
		return { ok: true, markerChannelId: response.markerChannelId };
	},
	timeoutResult: () => ({ ok: false, reason: 'timeout', message: null }),
	unavailableResult: () => ({ ok: false, reason: 'redis_unavailable', message: null })
});

export const startJtcSetupHub = (redisUrl: string | undefined): Promise<void> => hub.start(redisUrl);

export const stopJtcSetupHub = (): Promise<void> => hub.stop();

export function requestJtcSetup(payload: { requestId: string; guildId: string; userId: string; categoryId: string }): Promise<JtcSetupResult> {
	return hub.request({
		requestId: payload.requestId,
		payload,
		meta: { guildId: payload.guildId },
		timeoutMs: SETUP_TIMEOUT_MS,
		logContext: payload.guildId
	});
}
