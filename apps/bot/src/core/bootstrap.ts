import { envParseString } from '@skyra/env-utilities';
import { container } from '@sapphire/framework';
import { GatewayIntentBits, Partials } from 'discord.js';
import { BotApplication } from './botApplication.ts';
import { SapphireInterfaceLogger } from './logger.ts';
import { LavalinkNodeOptions } from 'lavalink-client';
import { NodeSessionStore } from '../modules/audio/lavalink/redisStore.ts';
import { LavalinkHandler } from '../modules/audio/lavalink/handlers/lavalinkHandler.ts';
import { setSentryShardTags } from './sentry.ts';
import * as Sentry from '@sentry/node';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const main = async () => {
	const isDevMode = process.env.NODE_ENV !== 'production';

	let shardIds: number[] | 'auto' = isDevMode ? [0] : 'auto';
	let shardCount: number = 1;

	if (!isDevMode) {
		// Production: Get shard ID assigned from manager via ShardClient
		const shardManagerUrl = process.env.SHARD_MANAGER_URL;
		if (!shardManagerUrl) {
			console.error('SHARD_MANAGER_URL is required in production mode. Exiting...');
			process.exit(1);
		}

		const { ShardClient, NoShardsAvailableError } = await import('@sirubot/shardclient');
		const shardClient = new ShardClient({
			serverURL: shardManagerUrl,
			authKey: process.env.AUTH_KEY ?? '',
			logger: console
		});

		const identifyRetryMs = Math.max(parseInt(process.env.SHARD_IDENTIFY_RETRY_MS ?? '5000', 10), 1000);
		// During rolling updates, shard slots can be temporarily unavailable.
		// Keep retrying instead of exiting so the new process can pick up shards once old process releases.
		while (true) {
			try {
				const identity = await shardClient.identify();
				shardIds = identity.shardIds;
				shardCount = identity.shardCount;
				break;
			} catch (error) {
				if (error instanceof NoShardsAvailableError) {
					console.warn(`No shards available from shard manager. Retrying in ${identifyRetryMs}ms...`);
					await sleep(identifyRetryMs);
					continue;
				}
				throw error;
			}
		}

		// Store shardClient in container (for stats reporting)
		container.shardClient = shardClient;
	}

	setSentryShardTags(shardIds);

	const client = new BotApplication({
		logger: {
			instance: new SapphireInterfaceLogger({
				name: 'SiruBOT',
				minLevel: parseInt(process.env.LOGLEVEL ?? '3', 10),
				type: 'pretty',
				hideLogPositionForProduction: process.env.NODE_ENV === 'production'
			})
		},
		shards: shardIds,
		shardCount,
		intents: [
			GatewayIntentBits.GuildModeration,
			GatewayIntentBits.GuildMembers,
			GatewayIntentBits.GuildMessageReactions,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildVoiceStates
		],
		partials: [Partials.Channel, Partials.GuildMember]
	});

	try {
		// show pid and pid-name
		client.logger.info(`Starting SiruBOT with PID: ${process.pid}`);
		client.logger.info(`Mode: ${isDevMode ? 'dev mode (standalone)' : `production (shards: [${shardIds}])`}`);

		client.logger.debug('Setting up logger...');
		container.logger = client.logger;

		// Audio -> General -> RedisStore -> Login -> Lavalink (After ready event)
		client.setupStore('audio');
		client.setupStore('general');

		client.logger.debug('Setting up database...');
		await client.setupDatabase();

		client.logger.debug('Setting up services...');
		client.setupServices();

		client.logger.debug('Setting up redis store manager... (optional)');
		await client.setupRedis(envParseString('REDIS_URL'));

		client.logger.info('Logging into discord...');
		await client.login(envParseString('DISCORD_TOKEN'));

		client.logger.debug('Setting up lavalink...');
		const lavalinkHosts = envParseString('LAVALINK_HOSTS')
			.split(',')
			.map((node, index) => {
				const parts = node.trim().split('_');
				if (parts.length < 3) {
					throw new Error(`Invalid LAVALINK_HOSTS format at index ${index}: "${node}". ` + `Expected: "id_host_port[_password]"`);
				}
				const [id, host, portStr, password] = parts;
				const port = parseInt(portStr);
				if (isNaN(port)) {
					throw new Error(`Invalid port "${portStr}" for node "${id}"`);
				}
				return { id, host, port, authorization: password ?? 'youshallnotpass' };
			}) as LavalinkNodeOptions[];
		await client.setupAudio(lavalinkHosts, { shardIds: Array.isArray(shardIds) ? shardIds : [0], shardCount });

		// Lavalink 핸들러 등록 및 노드 연결 (setupAudio 직후, 순서 보장)
		container.lavalinkHandler = new LavalinkHandler(container.audio);
		await container.audio.init({ id: client.user!.id });

		client.logger.info('Logged in as ' + client.user!.tag);

		// Health check HTTP server for Docker
		const { createServer } = await import('node:http');
		const healthPort = parseInt(process.env.HEALTH_PORT ?? '8080', 10);
		const healthServer = createServer((_req, res) => {
			// discord.js WebSocketStatus: 0 = READY
			const isHealthy = client.ws.status === 0;
			res.writeHead(isHealthy ? 200 : 503, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ ok: isHealthy, wsStatus: client.ws.status }));
		});
		healthServer.listen(healthPort, '0.0.0.0', () => {
			client.logger.info(`Health check server listening on :${healthPort}`);
		});

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

		// Handle gracefull shutdown
		const shutdown = async () => {
			client.logger.info('Shutting down gracefully...');
			if (healthServer) {
				healthServer.close();
			}

			// 1. Lavalink session을 Redis에 저장 (Redis 끊기 전!)
			if (container.audio && container.redisStore) {
				const sessionStore = container.redisStore.getNodeSessionStore();
				const shardKey = NodeSessionStore.makeShardKey(
					Array.isArray(shardIds) ? shardIds : [0]
				);
				for (const node of container.audio.nodeManager.nodes.values()) {
					if (node.sessionId) {
						await sessionStore.save(node.id, node.sessionId, shardKey);
						client.logger.info(`Saved session for node ${node.id}: ${node.sessionId}`);
					}
				}
			}

			// 2. Audio listeners 정리
			if (container.audio) {
				container.audio.removeAllListeners();
			}

			// 3. Redis disconnect (session 저장 후!)
			if (container.redisStore) {
				await container.redisStore.disconnect();
			}

			// 4. Database disconnect
			if (container.db) {
				await container.db.$disconnect();
			}

			// 5. ShardManager client
			if (container.shardClient) {
				container.shardClient.destroy();
			}
			// Flush unsent Sentry events
			await Sentry.close(2000);
			process.exit(0);
		};

		process.on('SIGINT', shutdown);
		process.on('SIGTERM', shutdown);
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
