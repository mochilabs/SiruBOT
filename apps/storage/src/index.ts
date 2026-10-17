import { validateEnv } from './config/env.ts';
import { buildServer } from './server.ts';

async function main(): Promise<void> {
	const env = validateEnv();
	const { fastify } = await buildServer(env);

	const close = async () => {
		await fastify.close();
	};
	process.on('SIGINT', () => void close().then(() => process.exit(0)));
	process.on('SIGTERM', () => void close().then(() => process.exit(0)));

	await fastify.listen({ port: env.PORT, host: '0.0.0.0' });
}

void main().catch((error) => {
	console.error('❌ storage 기동에 실패했어요:', error);
	process.exit(1);
});
