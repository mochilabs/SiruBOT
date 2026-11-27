import { getLogger } from '../utils/logger.ts';
import { createRequestReplyHub } from '../utils/requestReplyHub.ts';
import { panelPostRpc, roleValidationRpc } from '@sirubot/utils';

const logger = getLogger('panelHub');

const TIMEOUT_MS = 10_000;
const PENDING_LIMIT = 50;

export type PanelRelayFailureReason = 'redis_unavailable' | 'timeout' | 'bot_error';

export type PanelPostResult =
	{ ok: true; messageId?: string; channelId?: string } | { ok: false; reason: PanelRelayFailureReason; message: string | null };
export type RoleValidationResult = { ok: true; invalidRoleIds: string[] } | { ok: false; reason: PanelRelayFailureReason; message: string | null };

interface PanelPendingMeta {
	guildId: string;
}

const panelPostHub = createRequestReplyHub<typeof panelPostRpc, PanelPendingMeta, PanelPostResult>({
	name: 'panel post hub',
	label: 'panel post',
	mismatch: 'guildId mismatch',
	requestLabel: 'Panel post request',
	logger,
	contract: panelPostRpc,
	capacity: PENDING_LIMIT,
	matches: (response, meta) => response.guildId === meta.guildId,
	toResult: (response) => {
		if (response.error) return { ok: false, reason: 'bot_error', message: response.error };
		return { ok: true, messageId: response.messageId, channelId: response.channelId };
	},
	timeoutResult: () => ({ ok: false, reason: 'timeout', message: null }),
	unavailableResult: () => ({ ok: false, reason: 'redis_unavailable', message: null })
});

const roleValidationHub = createRequestReplyHub<typeof roleValidationRpc, PanelPendingMeta, RoleValidationResult>({
	name: 'role validation hub',
	label: 'role validation',
	mismatch: 'guildId mismatch',
	requestLabel: 'Role validation request',
	logger,
	contract: roleValidationRpc,
	capacity: PENDING_LIMIT,
	matches: (response, meta) => response.guildId === meta.guildId,
	toResult: (response) => {
		if (response.error) return { ok: false, reason: 'bot_error', message: response.error };
		return { ok: true, invalidRoleIds: response.invalidRoleIds ?? [] };
	},
	timeoutResult: () => ({ ok: false, reason: 'timeout', message: null }),
	unavailableResult: () => ({ ok: false, reason: 'redis_unavailable', message: null })
});

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

export function requestRoleValidation(payload: { requestId: string; guildId: string; roleIds: string[] }): Promise<RoleValidationResult> {
	return roleValidationHub.request({
		requestId: payload.requestId,
		payload,
		meta: { guildId: payload.guildId },
		timeoutMs: TIMEOUT_MS,
		logContext: payload.guildId
	});
}
