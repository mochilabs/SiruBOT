import { getLogger } from '../utils/logger.ts';
import { createRequestReplyHub } from '../utils/requestReplyHub.ts';
import {
	playerWebRpc,
	type PlayerVoiceContext,
	type PlayerWebControlRequest,
	type PlayerWebKind,
	type PlayerWebPlayRequest,
	type PlayerWebSearchRequest,
	type PlayerWebTrack,
	type PlayerWebVoiceContextRequest
} from '@sirubot/utils';

export type PlayerWebAnyRequest = PlayerWebSearchRequest | PlayerWebPlayRequest | PlayerWebControlRequest | PlayerWebVoiceContextRequest;

const logger = getLogger('playerWebHub');

const KIND_TIMEOUT_MS: Record<PlayerWebKind, number> = {
	search: 10_000,
	play: 12_000,
	control: 6_000,
	'voice-context': 4_000
};
const PENDING_LIMIT = 200;

export type PlayerWebFailureReason = 'redis_unavailable' | 'timeout' | 'bot_error';
export type PlayerWebResult =
	| { ok: true; tracks?: PlayerWebTrack[]; voice?: PlayerVoiceContext }
	| { ok: false; reason: PlayerWebFailureReason; message: string | null; code?: string };

export interface PlayerWebPendingMeta {
	guildId: string;
	kind: PlayerWebKind;
}

export const hub = createRequestReplyHub<typeof playerWebRpc, PlayerWebPendingMeta, PlayerWebResult>({
	name: 'player web hub',
	label: 'player web',
	mismatch: 'guildId/kind mismatch',
	requestLabel: 'Player web request',
	logger,
	contract: playerWebRpc,
	capacity: PENDING_LIMIT,
	matches: (response, meta) => response.guildId === meta.guildId && response.kind === meta.kind,
	toResult: (response) => {
		if (response.error) {
			return { ok: false, reason: 'bot_error', message: response.error, ...(response.code ? { code: response.code } : {}) };
		}
		return { ok: true, tracks: response.tracks, voice: response.voice };
	},
	timeoutResult: () => ({ ok: false, reason: 'timeout', message: null }),
	unavailableResult: () => ({ ok: false, reason: 'redis_unavailable', message: null })
});

export const startPlayerWebHub = (redisUrl: string | undefined): Promise<void> => hub.start(redisUrl);

export const stopPlayerWebHub = (): Promise<void> => hub.stop();

export function requestPlayerWeb(payload: PlayerWebAnyRequest): Promise<PlayerWebResult> {
	return hub.request({
		requestId: payload.requestId,
		payload,
		meta: { guildId: payload.guildId, kind: payload.kind },
		timeoutMs: KIND_TIMEOUT_MS[payload.kind],
		logContext: `${payload.guildId}, kind ${payload.kind}`
	});
}
