import Fastify from 'fastify';
import type { PrismaClient } from '@sirubot/prisma';
import type { Env } from './config/env.ts';
import { requireAuth } from './plugins/auth.ts';
import health from './routes/health.ts';
import pubsubRoutes from './routes/pubsub.ts';
import { eventsubRoutes } from './routes/eventsub.ts';
import subscriptionRoutes from './routes/social.ts';
import type { SocialDispatcher } from './services/dispatcher.ts';
import type { SocialWebhookHub } from './services/webhookHub.ts';
import type { TwitchApiClient } from './services/twitchApi.ts';
import type { NotifierRedis } from './services/redis.ts';

export async function buildServer(
	env: Env,
	services: {
		dispatcher: SocialDispatcher;
		getDb: () => PrismaClient | null;
		hub: SocialWebhookHub;
		twitchClient: TwitchApiClient | null;
		redis: NotifierRedis;
	}
) {
	// 로거는 app-kit 로거가 소유해요 — Fastify의 구조화 로거는 끄고, 라우트 에러는 모듈 로거(getLogger)로 남겨요
	// (logger:false일 때 reply.log는 no-op이라 유실됨).
	const fastify = Fastify({
		logger: false,
		genReqId: () => crypto.randomUUID()
	});
	fastify.addHook('onSend', async (request, reply) => {
		reply.header('x-request-id', request.id);
	});
	// WebSub/EventSub 콜백은 XML 본문으로 오므로 raw string으로 받아요 — HMAC 서명 검증에 원문이 필요해요.
	fastify.addContentTypeParser(['application/atom+xml', 'application/xml', 'text/xml'], { parseAs: 'string' }, (_request, body, done) =>
		done(null, body)
	);

	const guard = requireAuth(env.notifierAuthKey!);
	await health(fastify);
	// 공개 콜백 (무인증) — challenge echo·HMAC 검증이 인증을 대신해요.
	await pubsubRoutes(fastify, { dispatcher: services.dispatcher, hubSecret: env.YOUTUBE_HUB_SECRET ?? '' });
	await eventsubRoutes(fastify, { dispatcher: services.dispatcher, secret: env.TWITCH_EVENTSUB_SECRET ?? '' });
	// 보호 라우트 — guard(키 원문)가 인증을 담당해요.
	await subscriptionRoutes(fastify, {
		guard,
		getDb: services.getDb,
		hub: services.hub,
		twitchClient: services.twitchClient,
		redis: services.redis,
		fetchFn: fetch
	});
	return { fastify };
}
