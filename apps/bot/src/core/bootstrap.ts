import { envParseString } from '@skyra/env-utilities';
import { container } from '@sapphire/framework';
import { GatewayIntentBits, Partials } from 'discord.js';
import { BotApplication } from './botApplication.ts';
import { SapphireInterfaceLogger } from './logger.ts';
import { LavalinkNodeOptions } from 'lavalink-client';
import { setSentryShardTags } from './sentry.ts';
import * as Sentry from '@sentry/node';

export const main = async () => {
	// Dev mode: Run standalone without sharding if SHARD_MANAGER_URL is omitted
	const shardManagerUrl = process.env.SHARD_MANAGER_URL;
	const isDevMode = !shardManagerUrl;

	let shardIds: number[] | 'auto' = 'auto';
	let shardCount: number = 1;

	if (!isDevMode) {
		// Production: Get shard ID assigned from manager via ShardClient
		const { ShardClient, NoShardsAvailableError } = await import('@sirubot/shardclient');
		const shardClient = new ShardClient({
			serverURL: shardManagerUrl,
			authKey: process.env.AUTH_KEY ?? '',
			logger: console
		});

		try {
			const identity = await shardClient.identify();
			shardIds = identity.shardIds;
			shardCount = identity.shardCount;
		} catch (error) {
			if (error instanceof NoShardsAvailableError) {
				console.error('No shards available from shard manager. Exiting...');
				process.exit(1);
			}
			throw error;
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
			.map((node) => {
				const [id, host, port, password] = node.trim().split('_');
				return { id, host, port: parseInt(port), authorization: password ?? 'youshallnotpass' };
			}) as LavalinkNodeOptions[];
		await client.setupAudio(lavalinkHosts);

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
			if (container.audio) {
				container.audio.removeAllListeners();
			}
			if (container.shardClient) {
				container.shardClient.destroy();
			}
			// Flush unsent Sentry events
			await Sentry.close(2000);
			await client.destroy();
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
