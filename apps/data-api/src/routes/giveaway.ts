import type { FastifyInstance } from 'fastify';
import { giveawayManageRequestSchema } from '@sirubot/utils';
import { metrics } from '../utils/metrics.ts';
import { requestGiveawayManage } from '../services/giveawayHub.ts';
import { replyBotRelayFailure, sendError } from './common.ts';

export function registerGiveawayRoutes(fastify: FastifyInstance): void {
	fastify.post('/v1/internal/giveaway/manage', async (request, reply) => {
		try {
			const body = giveawayManageRequestSchema.parse({ ...(request.body as object), requestId: crypto.randomUUID() });
			const result = await requestGiveawayManage(body);
			metrics.request('giveaway-manage');
			if (result.ok) return reply.send({ ok: true, giveawayId: result.giveawayId ?? null, winnerIds: result.winnerIds ?? [] });
			return replyBotRelayFailure(reply, result.reason, {
				code: 'giveaway_manage_rejected',
				message: result.message,
				fallback: '나눔 요청을 처리하지 못했어요.'
			});
		} catch (error) {
			return sendError(reply, error);
		}
	});
}
