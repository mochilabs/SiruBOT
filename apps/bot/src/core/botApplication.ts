import { join } from 'node:path';
import { PrismaClient } from '@sirubot/prisma';
import { PrismaPg } from '@prisma/adapter-pg';

import { SapphireClient } from '@sapphire/framework';
import { RootData, container, getRootData } from '@sapphire/pieces';

import { ClientOptions } from 'discord.js';
import { LavalinkManager, LavalinkNodeOptions } from 'lavalink-client';

import { RedisStore } from '../modules/audio/lavalink/redisStore.ts';
import { autoPlayRelated } from '../modules/audio/lavalink/autoPlayRelated.ts';
import { GuildService } from '../services/guildService.ts';
import { TrackService } from '../services/trackService.ts';
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
		await redisStore.connect();

		container.redisStore = redisStore;

		return redisStore;
	}

	public async setupDatabase(): Promise<PrismaClient> {
		const db = new PrismaClient({
			adapter: new PrismaPg({
				connectionString: process.env.DATABASE_URL
			}),
			log: [
				{ level: 'error', emit: 'event' },
				{ level: 'warn', emit: 'event' },
				{ level: 'info', emit: 'event' },
				{ level: 'query', emit: 'event' }
			]
		});

		const subLogger = (this.logger as SapphireInterfaceLogger).getSubLogger({ name: 'prisma' });
		db.$on('query', (e) => subLogger.debug(e.query));
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
	}

	public async setupAudio(nodes: LavalinkNodeOptions[]) {
		const nodeSessions = await container.redisStore.getPlayerSaver().getNodeSessions();
		const audio = new LavalinkManager({
			nodes: nodes.map((node) => ({
				...node,
				sessionId: !node.id ? undefined : nodeSessions.get(node.id),
				retryAmount: 10
			})),
			sendToShard: (guildId, payload) => this.guilds.cache.get(guildId)?.shard.send(payload),
			client: {
				id: this.user!.id
			},
			autoSkip: true,
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

		container.playerNotifier = new PlayerNotifier();
		container.audio = audio;

		return audio;
	}
}
