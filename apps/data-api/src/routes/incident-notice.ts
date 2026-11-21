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
import { sendError } from './common.ts';

type RedisClient = NonNullable<ReturnType<typeof sharedCache.getClient>>;

/** 공지는 봇이 읽는 Redis 키에만 있어야 해요 — 메모리 폴백(`sharedCache.set`)은 봇에 닿지 않으므로 쓰지 않아요 */
function requireRedis(reply: { code: (n: number) => any }): RedisClient | null {
	const client = sharedCache.getClient();
	if (!client) {
		reply.code(503).send({ error: 'redis_unavailable', message: '장애 공지를 다루려면 Redis가 필요해요. 잠시 후 다시 시도해 주세요.' });
		return null;
	}
	return client;
}

/**
 * 장애 공지 (P-14) — 대시보드 `/admin` → 이 라우트 → Redis 키(TTL = 만료) → 봇이 30초 캐시로 읽어요.
 * 값은 다른 pending 키처럼 서명 봉투로 감싸요. 봇은 읽기만 해요.
 */
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

	// 만료 시간은 필수예요 (스키마가 강제). 새 공지는 이전 공지를 덮어써요.
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
