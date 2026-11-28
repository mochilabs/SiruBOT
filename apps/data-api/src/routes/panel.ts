import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { redisIdSchema, panelPostTypeSchema } from '@sirubot/utils';
import { metrics } from '../utils/metrics.ts';
import { requestPanelPost, requestRoleValidation, type PanelPostResult, type RoleValidationResult } from '../services/panelHub.ts';
import { replyBotRelayFailure, sendError, type ReplySink } from './common.ts';

const snowflake = z.string().regex(/^\d{17,20}$/, '올바른 ID 형식이 아니에요.');

function replyPanelPostResult(reply: ReplySink, result: PanelPostResult): unknown {
	if (result.ok) {
		return reply.send({ ok: true, messageId: result.messageId ?? null, channelId: result.channelId ?? null });
	}
	return replyBotRelayFailure(reply, result.reason, {
		code: 'panel_post_rejected',
		message: result.message,
		fallback: '패널을 게시하지 못했어요.'
	});
}

function replyRoleValidationResult(reply: ReplySink, result: RoleValidationResult): unknown {
	if (result.ok) {
		return reply.send({ ok: true, invalidRoleIds: result.invalidRoleIds });
	}
	return replyBotRelayFailure(reply, result.reason, {
		code: 'role_validation_rejected',
		message: result.message,
		fallback: '역할을 검증하지 못했어요.'
	});
}

export function registerPanelRoutes(fastify: FastifyInstance): void {
	const panelPostBody = z.object({
		guildId: redisIdSchema,
		type: panelPostTypeSchema,
		panelId: z.string().min(1).optional(),
		channelId: snowflake.optional(),
		refresh: z.boolean().optional()
	});

	fastify.post('/v1/internal/panel/post', async (request, reply) => {
		try {
			const { guildId, type, panelId, channelId, refresh } = panelPostBody.parse(request.body);
			const result = await requestPanelPost({
				requestId: crypto.randomUUID(),
				guildId,
				type,
				panelId,
				channelId,
				refresh
			});
			metrics.request('panel-post');
			return replyPanelPostResult(reply, result);
		} catch (error) {
			return sendError(reply, error);
		}
	});

	const roleValidationBody = z.object({
		guildId: redisIdSchema,
		roleIds: z.array(snowflake).max(25)
	});

	fastify.post('/v1/internal/role-panel/validate-roles', async (request, reply) => {
		try {
			const { guildId, roleIds } = roleValidationBody.parse(request.body);
			const result = await requestRoleValidation({
				requestId: crypto.randomUUID(),
				guildId,
				roleIds
			});
			metrics.request('role-validation');
			return replyRoleValidationResult(reply, result);
		} catch (error) {
			return sendError(reply, error);
		}
	});
}
