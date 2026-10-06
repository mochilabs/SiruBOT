import { initSentry, registerProcessErrorHandlers } from '@sirubot/utils';
import { validateEnv } from './config/env.ts';
import { buildServer } from './server.ts';
import { getLogger } from './utils/logger.ts';

const logger = getLogger('bootstrap');

initSentry({ service: 'data-api' });
registerProcessErrorHandlers(logger);

async function main(): Promise<void> {
	const env = validateEnv();
	const { fastify, close } = await buildServer(env);

	const shutdown = async (signal: string) => {
		logger.warn(`Received ${signal}, shutting down...`);
		await close();
		process.exit(0);
	};
	process.on('SIGTERM', () => void shutdown('SIGTERM'));
	process.on('SIGINT', () => void shutdown('SIGINT'));

	await fastify.listen({ port: env.PORT, host: '0.0.0.0' });
	logger.info(`data-api listening on :${env.PORT} (redis: ${env.REDIS_URL ? 'shared' : 'memory-only'})`);
}

void main().catch((error) => {
	logger.error('Failed to start data-api:', String(error));
	process.exit(1);
});
