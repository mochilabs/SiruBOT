import { join } from 'node:path';
import { PrismaClient } from '@sirubot/prisma';
import { SapphireClient } from '@sapphire/framework';
import { RootData, container, getRootData } from '@sapphire/pieces';

import { ClientOptions } from 'discord.js';
import { LavalinkManager, LavalinkNodeOptions } from 'lavalink-client';

import { RedisStoreManager } from '../modules/audio/lavalink/redisStoreManager.ts';
import { autoPlayRelated } from '../modules/audio/lavalink/autoPlayRelated.ts';
import { GuildService } from '../services/guildService.ts';
import { TrackService } from '../services/trackService.ts';

export class BotApplication<T extends boolean> extends SapphireClient<T> {
	private rootData: RootData = getRootData();
	constructor(options: ClientOptions) {
		super({
			...options
		});
	}

	public setupStore(name: string) {
		this.logger.debug(`[setupStore] Setting up module store: ${name}`);
		this.stores.registerPath(join(this.rootData.root, 'modules', name));
	}

	public async setupRedisStoreManager(url: string) {
		const redisStore = new RedisStoreManager({
			url
		});
		await redisStore.connect();

		container.redisStoreManager = redisStore;

		return redisStore;
	}

	public async setupDatabase() {
		const db = new PrismaClient({
			log: [
				{ level: 'error', emit: 'stdout' },
				{ level: 'warn', emit: 'stdout' },
				{ level: 'info', emit: 'stdout' },
				{ level: 'query', emit: 'stdout' }
			]
		});

		await db.$connect();
		container.db = db;

		return db;
	}

	public setupServices() {
		container.guildService = new GuildService();
		container.trackService = new TrackService();
	}

	public async setupAudio(nodes: LavalinkNodeOptions[]) {
		const nodeSessions = await container.redisStoreManager.getPlayerSaver().getNodeSessions();
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
				}
			},
			queueOptions: {
				queueStore: container.redisStoreManager.getQueueStore()
			}
		});

		container.audio = audio;

		return audio;
	}
}
