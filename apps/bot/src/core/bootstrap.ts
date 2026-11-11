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

	// 시그널 핸들러용 상태 — 핸들러를 셋업 "이전"에 등록하기 위해 바깥에 둔다.
	// (기존에는 try 블록 마지막에 등록해 셋업 실패/중단 구간에서 SIGTERM이 무시됐다.)
	let healthServer: Server | null = null;

	// Handle graceful shutdown — 셋업 성공 여부와 무관하게 즉시 등록한다.
	// 재진입 가드는 createShutdownHandler 안에 있다 (SIGINT/SIGTERM 중복 도착이나 핸들러 이중 실행 방지).
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

		// Audio -> General -> Voice -> Games -> RedisStore -> Login -> Lavalink (After ready event)
		for (const root of PIECE_ROOTS) client.setupStore(root);

		client.logger.debug('Setting up database...');
		await client.setupDatabase();

		client.logger.debug('Setting up services...');
		client.setupServices();

		client.logger.debug('Setting up redis store manager... (optional)');
		await client.setupRedis(config.redis.url);

		// Redis 구독 서비스군 start — 등록 순서와 서비스별 설명은 BotApplication.setupServices의 레지스트리에 있어요.
		await startRedisSubscribers(container.redisSubscribers, config.redis.url);

		client.logger.info('Logging into discord...');
		await client.login(config.discord.token);

		await setupLavalink(client, shardIds, shardCount);

		client.logger.info('Logged in as ' + client.user!.tag);

		// Health check HTTP server for Docker
		healthServer = await startHealthServer(client);

		// Production: report ready status + collect stats
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
