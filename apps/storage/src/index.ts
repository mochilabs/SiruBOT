import { initSentry, registerProcessErrorHandlers } from '@sirubot/utils/sentry';
import { validateEnv } from './config/env.ts';
import { buildServer } from './server.ts';
import { getLogger } from './utils/logger.ts';

const logger = getLogger('bootstrap');

// data-api·notifier와 같은 패턴 — SENTRY_DSN이 없으면 no-op이에요.
initSentry({ service: 'storage' });
registerProcessErrorHandlers(logger);

async function main(): Promise<void> {
	const env = validateEnv();
	const { fastify } = await buildServer(env);

	const close = async () => {
		await fastify.close();
	};
	process.on('SIGINT', () => void close().then(() => process.exit(0)));
	process.on('SIGTERM', () => void close().then(() => process.exit(0)));

	await fastify.listen({ port: env.PORT, host: '0.0.0.0' });
	logger.info(`storage가 ${env.PORT} 포트에서 들었어요.`);
}

void main().catch((error) => {
	logger.error('storage 기동에 실패했어요:', error);
	process.exit(1);
});
