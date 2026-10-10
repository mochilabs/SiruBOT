import { envParseString } from '@skyra/env-utilities';
import { container } from '@sapphire/framework';
import { Events, GatewayIntentBits, Partials } from 'discord.js';
import { BotApplication } from './botApplication.ts';
import { SapphireInterfaceLogger } from './logger.ts';
import { NodeSessionStore } from '../modules/audio/lavalink/redisStore.ts';
import { LavalinkHandler } from '../modules/audio/lavalink/handlers/lavalinkHandler.ts';
import { setSentryShardTags } from './sentry.ts';
import { parseLavalinkHosts } from '@sirubot/utils';
import * as Sentry from '@sentry/node';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const main = async () => {
	const isDevMode = process.env.NODE_ENV !== 'production';

	// 시그널 핸들러용 상태 — 핸들러를 셋업 "이전"에 등록하기 위해 바깥에 둔다.
	// (기존에는 try 블록 마지막에 등록해 셋업 실패/중단 구간에서 SIGTERM이 무시됐다.)
	let shutdownStarted = false;
	let healthServer: import('node:http').Server | null = null;

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
			GatewayIntentBits.GuildVoiceStates,
			// 고정 채널(commandChannel) 입력을 받으려면 메시지 본문이 필요 — 프리빌리지 인텐트, 개발자 포털에서도 활성화해야 함
			GatewayIntentBits.MessageContent
		],
		partials: [Partials.Channel, Partials.GuildMember, Partials.Message]
	});

	// Handle graceful shutdown — 셋업 성공 여부와 무관하게 즉시 등록한다.
	// 재진입 가드: SIGINT/SIGTERM 중복 도착이나 핸들러 이중 실행을 막는다.
	const shutdown = async (signal: string) => {
		if (shutdownStarted) return;
		shutdownStarted = true;
		client.logger.info(`${signal} received. Shutting down gracefully...`);
		if (healthServer) {
			healthServer.close();
		}

		// 종료 순서: 세션 저장 → 리스너 정리 → Redis → DB → 샤드 클라이언트 (세션 저장은 Redis 끊기 전에)
		if (container.audio && container.redisStore) {
			try {
				const sessionStore = container.redisStore.getNodeSessionStore();
				const shardKey = NodeSessionStore.makeShardKey(Array.isArray(shardIds) ? shardIds : [0]);
				for (const node of container.audio.nodeManager.nodes.values()) {
					if (node.sessionId) {
						// save는 Redis가 끊겨 있으면 실제로 기록하지 않는다 — 거짓 성공 로그를 내지 않는다.
						const saved = await sessionStore.save(node.id, node.sessionId, shardKey);
						if (saved) {
							client.logger.info(`Saved session for node ${node.id}: ${node.sessionId}`);
						} else {
							client.logger.warn(`Session save skipped/failed for node ${node.id} (redis unavailable)`);
						}
					}
				}
			} catch (error) {
				client.logger.error(`Failed to save node sessions during shutdown: ${error}`);
			}
		}

		// Audio listeners 정리 (+ 설정 무효화 구독 해제)
		// lavalink 핸들러의 watchdog/reconcile/복구 타이머를 먼저 해제한다 — 남은 타이머가
		// 종료 절차 중에 발화해 mixer REST/play를 시도하는 것을 막는다.
		container.lavalinkHandler?.cleanup();
		if (container.audio) {
			container.audio.removeAllListeners();
		}
		await container.guildSettingsInvalidator?.stop().catch(() => null);
		await container.botProfileService?.stop().catch(() => null);
		await container.memberGreetingService?.stop().catch(() => null);

		// 종료 전에 저널을 비운다 — Redis를 끊은 뒤엔 pending 큐/플레이어 변경이 소실된다.
		// 세션 저장(위)은 Redis 연결이 필요한 첫 단계고, 여기서 남은 저널을 마저 민 뒤 끊는다.
		if (container.redisStore) {
			await container.redisStore.flushPendingWrites().catch(() => null);
			await container.redisStore.disconnect().catch(() => null);
		}

		if (container.db) {
			await container.db.$disconnect().catch(() => null);
		}

		// 게이트웨이 정리 — 이 시점부터 새 이벤트가 유출되지 않는다.
		await client.destroy().catch(() => null);

		if (container.shardClient) {
			container.shardClient.destroy();
		}
		// Flush unsent Sentry events
		await Sentry.close(2000);
		process.exit(0);
	};

	process.once('SIGINT', () => void shutdown('SIGINT'));
	process.once('SIGTERM', () => void shutdown('SIGTERM'));

	try {
		// show pid and pid-name
		client.logger.info(`Starting SiruBOT with PID: ${process.pid}`);
		client.logger.info(`Mode: ${isDevMode ? 'dev mode (standalone)' : `production (shards: [${shardIds}])`}`);

		client.logger.debug('Setting up logger...');
		container.logger = client.logger;

		// Audio -> General -> Voice -> Games -> RedisStore -> Login -> Lavalink (After ready event)
		client.setupStore('audio');
		client.setupStore('general');
		client.setupStore('voice');
		client.setupStore('games');

		client.logger.debug('Setting up database...');
		await client.setupDatabase();

		client.logger.debug('Setting up services...');
		client.setupServices();

		client.logger.debug('Setting up redis store manager... (optional)');
		await client.setupRedis(envParseString('REDIS_URL'));

		// 대시보드 설정 저장 → data-api Redis 브로드캐스트 → 봇 GuildService 캐시 무효화.
		// 실패해도 부팅은 계속돼요 — 60초 TTL 폴백이 있어요.
		await container.guildSettingsInvalidator?.start(envParseString('REDIS_URL'), container.guildService);
		// 대시보드 봇 프로필(닉네임·아바타) 저장 → data-api → Redis → 봇 적용.
		// 실패해도 부팅은 계속돼요 — 패널이 상태를 못 받을 뿐이에요.
		await container.botProfileService?.start(envParseString('REDIS_URL'));
		// 대시보드 멤버 인사(환영/작별) 테스트 전송 → data-api → Redis → 봇 전송.
		// 실패해도 부팅은 계속돼요 — 실제 입퇴장 인사는 리스너가 이어서 처리해요.
		await container.memberGreetingService?.start(envParseString('REDIS_URL'));

		client.logger.info('Logging into discord...');
		await client.login(envParseString('DISCORD_TOKEN'));

		client.logger.debug('Setting up lavalink...');
		const { hosts: lavalinkHosts, defaultPasswordUsed } = parseLavalinkHosts(
			envParseString('LAVALINK_HOSTS'),
			envParseString('LAVALINK_DEFAULT_PASSWORD', '')
		);
		if (defaultPasswordUsed) {
			client.logger.warn(
				'Some LAVALINK_HOSTS entries have no password; using the default "youshallnotpass". Set the node password explicitly or provide LAVALINK_DEFAULT_PASSWORD.'
			);
		}
		await client.setupAudio(lavalinkHosts, { shardIds: Array.isArray(shardIds) ? shardIds : [0], shardCount });

		// Lavalink 핸들러 등록 및 노드 연결 (setupAudio 직후, 순서 보장)
		container.lavalinkHandler = new LavalinkHandler(container.audio);
		await container.audio.init({ id: client.user!.id });

		client.logger.info('Logged in as ' + client.user!.tag);

		// Health check HTTP server for Docker
		const { createServer } = await import('node:http');
		const healthPort = parseInt(process.env.HEALTH_PORT ?? '8080', 10);
		let everReady = false;
		let unreadySince: number | null = null;
		client.once(Events.ClientReady, () => {
			everReady = true;
			unreadySince = null;
		});
		healthServer = createServer((_req, res) => {
			const ready = client.isReady();
			if (ready) {
				everReady = true;
				unreadySince = null;
			} else if (everReady && unreadySince === null) {
				unreadySince = Date.now();
			}
			// 부팅 구간(READY 이전)은 503, 준비 완료 후의 일시 재연결은 200을 유지해
			// 게이트웨이 재연결 중 restart가 증폭되는 것을 막는다. 2분 내 복구 실패 시 다시 503.
			const reconnectingWithinGrace = everReady && unreadySince !== null && Date.now() - unreadySince < 120_000;
			const isHealthy = ready || reconnectingWithinGrace;
			res.writeHead(isHealthy ? 200 : 503, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ ok: isHealthy, ready, everReady, wsStatus: client.ws.status }));
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
