import { getLogger } from '../utils/logger.ts';
import { createRequestReplyHub } from '../utils/requestReplyHub.ts';
import {
	guildDataRpc,
	type GuildChannelItem,
	type GuildDataKind,
	type GuildDataRequest,
	type GuildMemberItem,
	type GuildRoleItem
} from '@sirubot/utils';

const logger = getLogger('guildDataHub');

const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;
const PENDING_LIMIT = 200;

export type GuildDataFailureReason = 'redis_unavailable' | 'timeout';
export type GuildDataResult =
	{ ok: true; channels?: GuildChannelItem[]; roles?: GuildRoleItem[]; members?: GuildMemberItem[] } | { ok: false; reason: GuildDataFailureReason };

export interface GuildDataPendingMeta {
	guildId: string;
	kind: GuildDataKind;
}

export const hub = createRequestReplyHub<typeof guildDataRpc, GuildDataPendingMeta, GuildDataResult>({
	name: 'guild data hub',
	label: 'guild data',
	mismatch: 'guildId/kind mismatch',
	requestLabel: 'Guild data request',
	logger,
	contract: guildDataRpc,
	capacity: PENDING_LIMIT,
	matches: (response, meta) => response.guildId === meta.guildId && response.kind === meta.kind,
	toResult: (response) => {
		if (response.error) {
			logger.debug(`Guild data response ${response.requestId} carried error: ${response.error}`);
			return { ok: false, reason: 'timeout' };
		}
		return { ok: true, channels: response.channels, roles: response.roles, members: response.members };
	},
	timeoutResult: () => ({ ok: false, reason: 'timeout' }),
	unavailableResult: () => ({ ok: false, reason: 'redis_unavailable' })
});

export const startGuildDataHub = (redisUrl: string | undefined): Promise<void> => hub.start(redisUrl);

export const stopGuildDataHub = (): Promise<void> => hub.stop();

export function requestGuildData(
	guildId: string,
	kind: GuildDataKind,
	userIds?: string[],
	timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
): Promise<GuildDataResult> {
	const requestId = crypto.randomUUID();
	const request: GuildDataRequest = userIds ? { requestId, guildId, kind, userIds } : { requestId, guildId, kind };
	return hub.request({ requestId, payload: request, meta: { guildId, kind }, timeoutMs, logContext: guildId });
}

export const guildDataHubStatus = (): { pending: number; subscribed: boolean } => hub.status();
