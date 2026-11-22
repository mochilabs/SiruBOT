/**
 * 나눔 관리 request/reply 허브 — 대시보드의 시작·종료·취소·다시 뽑기 요청을 봇에 전달해 응답을 상관해요.
 *
 * `/v1/internal/giveaway/manage`가 REQUEST 채널(`sirubot:giveaway-manage:request`)로 요청을 브로드캐스트하면
 * 해당 길드를 보유한 봇이 GiveawayService로 처리한 뒤 RESPONSE 채널로 결과를 응답해요.
 * 시작은 카드 게시까지 포함하므로 다른 패널 요청보다 여유 있게 기다려요.
 */
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

/** 나눔 관리 요청을 봇에 전달하고 응답을 기다려요. 응답이 없으면 봇 미보유·미연결과 같은 timeout이에요 */
export function requestGiveawayManage(payload: GiveawayManageRequest): Promise<GiveawayManageResult> {
	return giveawayHub.request({
		requestId: payload.requestId,
		payload,
		meta: { guildId: payload.guildId },
		timeoutMs: TIMEOUT_MS,
		logContext: payload.guildId
	});
}
