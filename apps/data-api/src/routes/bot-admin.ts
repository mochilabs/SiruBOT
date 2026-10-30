import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { botAdminKindSchema, redisIdSchema } from '@sirubot/utils';
import { z } from 'zod';
import { requestBotAdmin } from '../services/botAdminHub.ts';
import { metrics } from '../utils/metrics.ts';
import { replyBotRelayFailure, sendError } from './common.ts';

const botAdminActionBodySchema = z
	.object({
		kind: botAdminKindSchema,
		nodeId: redisIdSchema.optional()
	})
	.refine((val) => (val.kind !== 'node-reconnect' && val.kind !== 'node-disconnect') || typeof val.nodeId === 'string', {
		message: '노드 제어에는 nodeId가 필요해요.'
	});

export function registerBotAdminRoutes(fastify: FastifyInstance): void {
	fastify.post('/v1/internal/bot-admin', async (request, reply) => {
		try {
			const parsed = botAdminActionBodySchema.parse(request.body ?? {});
			metrics.request('/v1/internal/bot-admin');
			const result = await requestBotAdmin({
				requestId: randomUUID(),
				kind: parsed.kind,
				nodeId: parsed.nodeId
			});
			if (!result.ok) {
				return replyBotRelayFailure(reply, result.reason, {
					code: 'bot_admin_rejected',
					message: result.message,
					fallback: '봇 제어 요청을 처리하지 못했어요.'
				});
			}
			return {
				ok: true,
				nodes: result.nodes,
				emojis: result.emojis,
				stores: result.stores,
				message: result.message
			};
		} catch (error) {
			return sendError(reply, error);
		}
	});
}
