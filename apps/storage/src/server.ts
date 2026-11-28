import Fastify from 'fastify';
import { registerAppErrorHandler } from '@sirubot/app-kit';
import { captureSentryException } from '@sirubot/utils/sentry';
import type { Env } from './config/env.ts';
import { requireAuth } from './plugins/auth.ts';
import { getLogger } from './utils/logger.ts';
import health from './routes/health.ts';
import { registerObjectRoutes } from './routes/objects.ts';
import { ObjectStore } from './services/objectStore.ts';

export async function buildServer(env: Env) {
	const fastify = Fastify({ logger: false, genReqId: () => crypto.randomUUID() });
	fastify.addHook('onSend', async (request, reply) => {
		reply.header('x-request-id', request.id);
	});
	registerAppErrorHandler(fastify, { logger: getLogger('server'), onServerError: captureSentryException });

	const guard = requireAuth(env.storageAuthKey!);
	await health(fastify);
	await registerObjectRoutes(fastify, {
		store: new ObjectStore(env.STORAGE_DATA_DIR),
		guard,
		publicUrl: env.STORAGE_PUBLIC_URL
	});
	return { fastify };
}
