import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { redisIdSchema } from '@sirubot/utils';
import { metrics } from '../utils/metrics.ts';

/**
 * 소셜 알림 프록시 — 대시보드의 단일 게이트웨이(data-api) 규칙을 유지하면서
 * 실제 구독 도메인 로직은 notifier(단일 소유자)에 위임해요.
 * 파라미터·바디의 최종 검증은 notifier가 담당하고, 여기서는 경로 파라미터만 검증해요.
 */

const guildIdParams = z.object({ guildId: redisIdSchema });
/** 구독 수정·삭제 경로 파라미터 — notifier가 길드 스코프(`{ id, guildId }`)로 소유권을 검증하므로 guildId가 함께 필요해요. */
const subscriptionRouteParams = z.object({ guildId: redisIdSchema, id: z.string().uuid() });

type ForwardResult = { status: number; body: unknown } | null;

/** notifier로 요청을 넘겨요 — 결과는 {status, body}로 정규화, 설정·네트워크 실패는 null/throw로 구분해요. */
async function forwardToNotifier(
	deps: { notifierUrl?: string; notifierAuthKey?: string },
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
	path: string,
	options: { body?: unknown; query?: Record<string, string | number> } = {}
): Promise<ForwardResult> {
	if (!deps.notifierUrl) return null;
	const url = new URL(deps.notifierUrl + path);
	for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, String(value));
	const headers: Record<string, string> = {};
	if (options.body !== undefined) headers['content-type'] = 'application/json';
	if (deps.notifierAuthKey) headers.authorization = deps.notifierAuthKey;
	const response = await fetch(url, {
		method,
		headers,
		body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
		signal: AbortSignal.timeout(10_000)
	});
	let body: unknown = null;
	try {
		body = await response.json();
	} catch {
		body = null;
	}
	return { status: response.status, body };
}

function replyProxyResult(reply: FastifyReply, result: ForwardResult) {
	if (!result) {
		return reply.code(503).send({ error: 'notifier_not_configured', message: '알림 서버 주소가 설정되지 않았어요.' });
	}
	return reply.code(result.status).send(result.body);
}

async function handleProxy(
	deps: { notifierUrl?: string; notifierAuthKey?: string },
	reply: FastifyReply,
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
	path: string,
	options: { body?: unknown; query?: Record<string, string | number> } = {}
) {
	try {
		const result = await forwardToNotifier(deps, method, path, options);
		return replyProxyResult(reply, result);
	} catch {
		return reply.code(502).send({ error: 'notifier_unreachable', message: '알림 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.' });
	}
}

export async function registerSocialRoutes(fastify: FastifyInstance, deps: { notifierUrl?: string; notifierAuthKey?: string }): Promise<void> {
	fastify.get('/v1/guilds/:guildId/social/subscriptions', async (request, reply) => {
		const parsed = guildIdParams.safeParse(request.params);
		if (!parsed.success) {
			return reply.code(400).send({ error: 'invalid_params', message: '길드 ID 형식이 올바르지 않아요.' });
		}
		metrics.request('social-subscriptions-list');
		return handleProxy(deps, reply, 'GET', `/v1/guilds/${parsed.data.guildId}/social/subscriptions`);
	});

	fastify.post('/v1/guilds/:guildId/social/subscriptions', async (request, reply) => {
		const parsed = guildIdParams.safeParse(request.params);
		if (!parsed.success) {
			return reply.code(400).send({ error: 'invalid_params', message: '길드 ID 형식이 올바르지 않아요.' });
		}
		metrics.request('social-subscriptions-create');
		return handleProxy(deps, reply, 'POST', `/v1/guilds/${parsed.data.guildId}/social/subscriptions`, { body: request.body });
	});

	fastify.patch('/v1/guilds/:guildId/social/subscriptions/:id', async (request, reply) => {
		const parsed = subscriptionRouteParams.safeParse(request.params);
		if (!parsed.success) {
			return reply.code(400).send({ error: 'invalid_params', message: '구독 ID 형식이 올바르지 않아요.' });
		}
		metrics.request('social-subscriptions-update');
		return handleProxy(deps, reply, 'PATCH', `/v1/guilds/${parsed.data.guildId}/social/subscriptions/${parsed.data.id}`, { body: request.body });
	});

	fastify.delete('/v1/guilds/:guildId/social/subscriptions/:id', async (request, reply) => {
		const parsed = subscriptionRouteParams.safeParse(request.params);
		if (!parsed.success) {
			return reply.code(400).send({ error: 'invalid_params', message: '구독 ID 형식이 올바르지 않아요.' });
		}
		metrics.request('social-subscriptions-delete');
		return handleProxy(deps, reply, 'DELETE', `/v1/guilds/${parsed.data.guildId}/social/subscriptions/${parsed.data.id}`);
	});

	fastify.get('/v1/social/chzzk/search', async (request, reply) => {
		metrics.request('social-chzzk-search');
		const query = (request.query ?? {}) as Record<string, string>;
		return handleProxy(deps, reply, 'GET', '/v1/social/chzzk/search', { query });
	});

	fastify.post('/v1/social/chzzk/profile', async (request, reply) => {
		metrics.request('social-chzzk-profile');
		return handleProxy(deps, reply, 'POST', '/v1/social/chzzk/profile', { body: request.body });
	});

	fastify.post('/v1/social/youtube/resolve', async (request, reply) => {
		metrics.request('social-youtube-resolve');
		return handleProxy(deps, reply, 'POST', '/v1/social/youtube/resolve', { body: request.body });
	});

	fastify.post('/v1/social/twitch/resolve', async (request, reply) => {
		metrics.request('social-twitch-resolve');
		return handleProxy(deps, reply, 'POST', '/v1/social/twitch/resolve', { body: request.body });
	});
}
