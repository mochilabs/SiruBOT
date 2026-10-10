import { join } from 'node:path';
import { PrismaClient } from '@sirubot/prisma';
import { PrismaPg } from '@prisma/adapter-pg';

import { SapphireClient } from '@sapphire/framework';
import { RootData, container, getRootData } from '@sapphire/pieces';

import { ClientOptions } from 'discord.js';
import { LavalinkManager, LavalinkNodeOptions } from 'lavalink-client';

import { RedisStore, NodeSessionStore } from '../modules/audio/lavalink/redisStore.ts';
import { autoPlayRelated } from '../modules/audio/lavalink/autoPlayRelated.ts';
import { GuildService } from '../services/guildService.ts';
import { TrackService } from '../services/trackService.ts';
import { PlaylistService } from '../services/playlistService.ts';
import { AudioService } from '../services/audioService.ts';
import { MixerService } from '../services/mixerService.ts';
import { TempVoiceService } from '../services/tempVoiceService.ts';
import { AiMemoryService } from '../services/aiMemoryService.ts';
import { GuildSettingsInvalidator } from '../services/guildSettingsInvalidator.ts';
import { BotProfileService } from '../services/botProfileService.ts';
import { MemberGreetingService } from '../services/memberGreetingService.ts';
import { SapphireInterfaceLogger } from './logger.ts';
import { PlayerNotifier } from '../modules/audio/lavalink/player/playerNotifier.ts';
import { CustomPlayer } from '../modules/audio/lavalink/player/customPlayer.ts';

export class BotApplication<T extends boolean> extends SapphireClient<T> {
	private rootData: RootData = getRootData();
	constructor(options: ClientOptions) {
		super({
			...options
		});
	}

	public setupStore(name: string) {
		this.logger.debug(`Setting up module store: ${name}`);
		this.stores.registerPath(join(this.rootData.root, 'modules', name));
	}

	public async setupRedis(url: string) {
		const redisStore = new RedisStore({
			url
		});
		try {
			await redisStore.connect();
		} catch (error) {
			// Redis 없이도 메모리 폴백으로 부팅 계속 (큐/세션은 휘발). 연결 실패를 치명 오류로 취급하지 않음.
			this.logger.warn(`Redis connection failed, continuing in memory-only mode: ${error}`);
		}

		container.redisStore = redisStore;

		return redisStore;
	}

	public async setupDatabase(): Promise<PrismaClient> {
		// 쿼리 이벤트는 쿼리마다 파라미터까지 구성된다 — LOGLEVEL 4(디버그) 이상에서만 붙인다.
		// (data-api 쪽 클라이언트도 쿼리 로깅을 안 쓴다: apps/data-api/src/services/db.ts)
		const logLevel = parseInt(process.env.LOGLEVEL ?? '3', 10);
		const prismaEventLog: Array<{ level: 'error' | 'warn' | 'info' | 'query'; emit: 'event' }> = [
			{ level: 'error', emit: 'event' },
			{ level: 'warn', emit: 'event' },
			{ level: 'info', emit: 'event' }
		];
		if (logLevel >= 4) prismaEventLog.push({ level: 'query', emit: 'event' });

		const db = new PrismaClient({
			adapter: new PrismaPg({
				connectionString: process.env.DATABASE_URL
			}),
			log: prismaEventLog
		});

		const subLogger = (this.logger as SapphireInterfaceLogger).getSubLogger({ name: 'prisma' });
		if (logLevel >= 4) db.$on('query', (e) => subLogger.debug(e.query));
		db.$on('info', (e) => subLogger.info(e.message));
		db.$on('warn', (e) => subLogger.warn(e.message));
		db.$on('error', (e) => subLogger.error(e.message));

		await db.$connect();
		container.db = db;

		return db;
	}

	public setupServices() {
		container.guildService = new GuildService();
		container.trackService = new TrackService();
		container.playlistService = new PlaylistService();
		container.audioService = new AudioService();
		container.mixerService = new MixerService();
		container.tempVoiceService = new TempVoiceService();
		container.aiMemoryService = new AiMemoryService();

		// Redis 구독 3형제 — bootstrap이 start하고 shutdown이 stop한다 (레지스트리 하나로 모은다)
		const subscriberLogger = {
			info: (msg: string) => container.logger.info(msg),
			warn: (msg: string) => container.logger.warn(msg),
			error: (msg: string) => container.logger.error(msg),
			debug: (msg: string) => container.logger.debug(msg)
		};
		container.guildSettingsInvalidator = new GuildSettingsInvalidator(subscriberLogger);
		container.botProfileService = new BotProfileService(subscriberLogger);
		container.memberGreetingService = new MemberGreetingService(subscriberLogger);
	}

	public async setupAudio(nodes: LavalinkNodeOptions[], shardInfo: { shardIds: number[]; shardCount: number }) {
		const sessionStore = container.redisStore.getNodeSessionStore();
		const shardKey = NodeSessionStore.makeShardKey(shardInfo.shardIds);

		// 각 노드에 대해 이전 sessionId 조회
		const nodeSessionMap = new Map<string, string>();
		for (const node of nodes) {
			if (node.id) {
				const sessionId = await sessionStore.get(node.id, shardKey);
				if (sessionId) {
					nodeSessionMap.set(node.id, sessionId);
				}
			}
		}

		const audio = new LavalinkManager({
			nodes: nodes.map((node) => ({
				...node,
				sessionId: !node.id ? undefined : nodeSessionMap.get(node.id),
				retryAmount: 9999,
				retryDelay: 5000
			})),
			sendToShard: (guildId, payload) => this.guilds.cache.get(guildId)?.shard.send(payload),
			client: {
				id: this.user!.id
			},
			autoSkip: false,
			playerOptions: {
				onDisconnect: {
					autoReconnect: true
				},
				onEmptyQueue: {
					destroyAfterMs: 10000,
					autoPlayFunction: autoPlayRelated
				},
				maxErrorsPerTime: {
					maxAmount: 3,
					threshold: 35000
				}
			},
			playerClass: CustomPlayer,
			queueOptions: {
				queueStore: container.redisStore.getQueueStore()
			}
		});

		container.shardInfo = shardInfo;
		container.playerNotifier = new PlayerNotifier();
		container.audio = audio;

		return audio;
	}
}
