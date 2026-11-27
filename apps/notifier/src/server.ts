import Fastify from 'fastify';
import { registerAppErrorHandler } from '@sirubot/app-kit';
import type { PrismaClient } from '@sirubot/prisma';
import { captureSentryException } from '@sirubot/utils/sentry';
import type { Env } from './config/env.ts';
import { requireAuth } from './plugins/auth.ts';
import { getLogger } from './utils/logger.ts';
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
	const fastify = Fastify({
		logger: false,
		genReqId: () => crypto.randomUUID()
	});
	fastify.addHook('onSend', async (request, reply) => {
		reply.header('x-request-id', request.id);
	});
	registerAppErrorHandler(fastify, { logger: getLogger('server'), onServerError: captureSentryException });
	// HMAC 서명 검증에 raw string 본문이 필요해요.
	fastify.addContentTypeParser(['application/atom+xml', 'application/xml', 'text/xml'], { parseAs: 'string' }, (_request, body, done) =>
		done(null, body)
	);

	const guard = requireAuth(env.notifierAuthKey!);
	await health(fastify);
	await pubsubRoutes(fastify, { dispatcher: services.dispatcher, hubSecret: env.YOUTUBE_HUB_SECRET ?? '' });
	await eventsubRoutes(fastify, { dispatcher: services.dispatcher, secret: env.TWITCH_EVENTSUB_SECRET ?? '' });
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
