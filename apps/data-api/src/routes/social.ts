import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { redisIdSchema } from '@sirubot/utils';
import { metrics } from '../utils/metrics.ts';
import { guildIdParams } from './common.ts';

const subscriptionRouteParams = z.object({ guildId: redisIdSchema, id: z.string().uuid() });

type ForwardResult = { status: number; body: unknown } | null;

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

function parseParamsOr400<Output>(reply: FastifyReply, schema: z.ZodType<Output>, params: unknown, message: string): Output | null {
	const parsed = schema.safeParse(params);
	if (!parsed.success) {
		reply.code(400).send({ error: 'invalid_params', message });
		return null;
	}
	return parsed.data;
}

export async function registerSocialRoutes(fastify: FastifyInstance, deps: { notifierUrl?: string; notifierAuthKey?: string }): Promise<void> {
	fastify.get('/v1/guilds/:guildId/social/subscriptions', async (request, reply) => {
		const parsed = parseParamsOr400(reply, guildIdParams, request.params, '길드 ID 형식이 올바르지 않아요.');
		if (!parsed) return reply;
		metrics.request('social-subscriptions-list');
		return handleProxy(deps, reply, 'GET', `/v1/guilds/${parsed.guildId}/social/subscriptions`);
	});

	fastify.post('/v1/guilds/:guildId/social/subscriptions', async (request, reply) => {
		const parsed = parseParamsOr400(reply, guildIdParams, request.params, '길드 ID 형식이 올바르지 않아요.');
		if (!parsed) return reply;
		metrics.request('social-subscriptions-create');
		return handleProxy(deps, reply, 'POST', `/v1/guilds/${parsed.guildId}/social/subscriptions`, { body: request.body });
	});

	fastify.patch('/v1/guilds/:guildId/social/subscriptions/:id', async (request, reply) => {
		const parsed = parseParamsOr400(reply, subscriptionRouteParams, request.params, '구독 ID 형식이 올바르지 않아요.');
		if (!parsed) return reply;
		metrics.request('social-subscriptions-update');
		return handleProxy(deps, reply, 'PATCH', `/v1/guilds/${parsed.guildId}/social/subscriptions/${parsed.id}`, { body: request.body });
	});

	fastify.delete('/v1/guilds/:guildId/social/subscriptions/:id', async (request, reply) => {
		const parsed = parseParamsOr400(reply, subscriptionRouteParams, request.params, '구독 ID 형식이 올바르지 않아요.');
		if (!parsed) return reply;
		metrics.request('social-subscriptions-delete');
		return handleProxy(deps, reply, 'DELETE', `/v1/guilds/${parsed.guildId}/social/subscriptions/${parsed.id}`);
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
