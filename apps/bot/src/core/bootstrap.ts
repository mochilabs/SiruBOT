import { container } from '@sapphire/framework';
import type { Server } from 'node:http';
import { getConfig } from '../lib/config.ts';
import { createBotClient } from './botClient.ts';
import { startHealthServer } from './healthServer.ts';
import { PIECE_ROOTS } from './pieceRoots.ts';
import { setupLavalink } from './lavalinkSetup.ts';
import { startRedisSubscribers } from './redisSubscribers.ts';
import { resolveShardIdentity } from './shardIdentity.ts';
import { createShutdownHandler } from './shutdown.ts';
import { setSentryShardTags } from './sentry.ts';
import * as Sentry from '@sentry/node';

export const main = async () => {
	const config = getConfig();
	const isDevMode = !config.isProduction;

	const { shardIds, shardCount } = await resolveShardIdentity(isDevMode, config.shard);

	setSentryShardTags(shardIds);

	const client = createBotClient(shardIds, shardCount);

	// 셋업 실패/중단 중에도 SIGTERM을 처리하도록 try 바깥에 선언하고 즉시 등록해요.
	let healthServer: Server | null = null;

	const shutdown = createShutdownHandler({
		logger: client.logger,
		container,
		client,
		getHealthServer: () => healthServer,
		shardIds,
		closeSentry: (timeoutMs) => Sentry.close(timeoutMs),
		exit: (code) => process.exit(code)
	});
	process.once('SIGINT', () => void shutdown('SIGINT'));
	process.once('SIGTERM', () => void shutdown('SIGTERM'));

	try {
		client.logger.info(`Starting SiruBOT with PID: ${process.pid}`);
		client.logger.info(`Mode: ${isDevMode ? 'dev mode (standalone)' : `production (shards: [${shardIds}])`}`);

		client.logger.debug('Setting up logger...');
		container.logger = client.logger;

		for (const root of PIECE_ROOTS) client.setupStore(root);

		client.logger.debug('Setting up database...');
		await client.setupDatabase();

		client.logger.debug('Setting up services...');
		client.setupServices();

		client.logger.debug('Setting up redis store manager... (optional)');
		await client.setupRedis(config.redis.url);

		await startRedisSubscribers(container.redisSubscribers, config.redis.url);

		client.logger.info('Logging into discord...');
		await client.login(config.discord.token);

		await setupLavalink(client, shardIds, shardCount);

		client.logger.info('Logged in as ' + client.user!.tag);

		healthServer = await startHealthServer(client);

		if (!isDevMode && container.shardClient) {
			container.shardClient.reportStatus('ready');
			container.shardClient.onStats(() => ({
				guilds: client.guilds.cache.size,
				players: container.audio?.players?.size ?? 0,
				memoryUsage: process.memoryUsage().heapUsed,
				uptime: process.uptime()
			}));
		}
	} catch (error) {
		client.logger.error('Error setting up application...');
		client.logger.fatal(error);
		await client.destroy();
		if (container.shardClient) {
			container.shardClient.destroy();
		}
		process.exit(1);
	}
};
