import type { FastifyInstance } from 'fastify';
import { INCIDENT_NOTICE_KEY } from '@sirubot/utils';
import {
	buildIncidentNotice,
	incidentNoticeInputSchema,
	incidentNoticeSchema,
	incidentNoticeTtlSeconds,
	isIncidentNoticeActive,
	type IncidentNotice
} from '@sirubot/utils/incidentNotice';
import { resolveRedisSigningKey, unwrapRedisMessage, wrapRedisMessage } from '@sirubot/utils/redisEnvelope';
import { sharedCache } from '../utils/cache.ts';
import { metrics } from '../utils/metrics.ts';
import { sendError, type ReplySink } from './common.ts';

type RedisClient = NonNullable<ReturnType<typeof sharedCache.getClient>>;

// Notice must live in Redis only; in-memory fallback never reaches the bot.
function requireRedis(reply: ReplySink): RedisClient | null {
	const client = sharedCache.getClient();
	if (!client) {
		reply.code(503).send({ error: 'redis_unavailable', message: '장애 공지를 다루려면 Redis가 필요해요. 잠시 후 다시 시도해 주세요.' });
		return null;
	}
	return client;
}

export function registerIncidentNoticeRoutes(fastify: FastifyInstance): void {
	const signingKey = resolveRedisSigningKey(process.env);

	async function readNotice(client: RedisClient): Promise<IncidentNotice | null> {
		const raw = await client.get(INCIDENT_NOTICE_KEY);
		if (!raw) return null;
		const body = unwrapRedisMessage(signingKey, raw);
		if (body === null) return null;
		try {
			const parsed = incidentNoticeSchema.safeParse(JSON.parse(body));
			return parsed.success && isIncidentNoticeActive(parsed.data, Date.now()) ? parsed.data : null;
		} catch {
			return null;
		}
	}

	fastify.get('/v1/internal/incident-notice', async (_request, reply) => {
		try {
			const client = requireRedis(reply);
			if (!client) return reply;
			metrics.request('/v1/internal/incident-notice');
			return { notice: await readNotice(client) };
		} catch (error) {
			return sendError(reply, error);
		}
	});

	fastify.post('/v1/internal/incident-notice', async (request, reply) => {
		try {
			const input = incidentNoticeInputSchema.parse(request.body ?? {});
			const client = requireRedis(reply);
			if (!client) return reply;
			const now = Date.now();
			const notice = buildIncidentNotice(input, now);
			await client.set(INCIDENT_NOTICE_KEY, wrapRedisMessage(signingKey, notice), { EX: incidentNoticeTtlSeconds(notice, now) });
			metrics.request('/v1/internal/incident-notice');
			return { ok: true, notice };
		} catch (error) {
			return sendError(reply, error);
		}
	});

	fastify.delete('/v1/internal/incident-notice', async (_request, reply) => {
		try {
			const client = requireRedis(reply);
			if (!client) return reply;
			await client.del(INCIDENT_NOTICE_KEY);
			metrics.request('/v1/internal/incident-notice');
			return { ok: true };
		} catch (error) {
			return sendError(reply, error);
		}
	});
}
