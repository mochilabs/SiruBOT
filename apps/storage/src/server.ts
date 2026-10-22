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
	// 공용 에러 계약 — 라우트가 미처 처리하지 못한 층(디렉토리 I/O 오류 등)만 수거해요.
	// objects 라우트의 ObjectPathError 개별 400 매핑은 그대로 써요.
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
