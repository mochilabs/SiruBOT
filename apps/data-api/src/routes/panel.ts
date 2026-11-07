import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { redisIdSchema, panelPostTypeSchema } from '@sirubot/utils';
import { metrics } from '../utils/metrics.ts';
import { requestPanelPost, requestRoleValidation, type PanelPostResult, type RoleValidationResult } from '../services/panelHub.ts';
import { replyBotRelayFailure, sendError } from './common.ts';

const snowflake = z.string().regex(/^\d{17,20}$/, '올바른 ID 형식이 아니에요.');

/**
 * 패널 게시·역할 검증 라우트 — 대시보드가 봇에 메시지 게시·역할 부여 가능 여부를 위임해요.
 *
 * - `/v1/internal/panel/post`: 티켓·역할 패널을 봇이 게시. type에 따라 panelId 필요.
 * - `/v1/internal/role-panel/validate-roles`: 저장 전 roleIds 부여 가능 여부 검증.
 *
 * Redis 없으면 503, 봇 미응답이면 502, 봇이 검증/게시 거부 사유를 실어 보내면 400.
 */

/** PanelPostResult를 HTTP로 매핑 — 성공은 messageId, 실패는 공통부(replyBotRelayFailure)로 내려줘요 */
function replyPanelPostResult(reply: { code: (n: number) => any; send: (body: unknown) => any }, result: PanelPostResult): any {
	if (result.ok) {
		return reply.send({ ok: true, messageId: result.messageId ?? null, channelId: result.channelId ?? null });
	}
	return replyBotRelayFailure(reply, result.reason, {
		code: 'panel_post_rejected',
		message: result.message,
		fallback: '패널을 게시하지 못했어요.'
	});
}

/** RoleValidationResult를 HTTP로 매핑 — 성공은 invalidRoleIds, 실패는 공통부로 내려줘요 */
function replyRoleValidationResult(reply: { code: (n: number) => any; send: (body: unknown) => any }, result: RoleValidationResult): any {
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
