import { join } from 'node:path';
import { PrismaClient } from '@sirubot/prisma';
import { PrismaPg } from '@prisma/adapter-pg';

import { SapphireClient } from '@sapphire/framework';
import { RootData, container, getRootData } from '@sapphire/pieces';
import { resolveRedisSigningKey } from '@sirubot/utils/redisEnvelope';

import { ClientOptions } from 'discord.js';
import { LavalinkManager, LavalinkNodeOptions } from 'lavalink-client';

import { RedisStore, NodeSessionStore } from '../modules/audio/lavalink/redisStore.ts';
import { autoPlayRelated } from '../modules/audio/lavalink/autoPlayRelated.ts';
import { GuildService } from '../services/guildService.ts';
import { TrackService } from '../services/trackService.ts';
import { PlaylistService } from '../services/playlistService.ts';
import { AudioService } from '../services/audioService.ts';
import { MixerService } from '../services/mixerService.ts';
import { TtsService } from '../services/ttsService.ts';
import { TtsUserSettingsService } from '../services/ttsUserSettings.ts';
import { ChatTtsService } from '../services/chatTts.ts';
import { TempVoiceService } from '../services/tempVoiceService.ts';
import { AiMemoryService } from '../services/aiMemoryService.ts';
import { TicketService } from '../services/ticketService.ts';
import { GuildSettingsInvalidator } from '../services/guildSettingsInvalidator.ts';
import { PlayerWebResponder } from '../services/playerWebResponder.ts';
import { JtcSetupResponder } from '../services/jtcSetupResponder.ts';
import { SocialWebhookResponder } from '../services/socialWebhookResponder.ts';
import { BotProfileService } from '../services/botProfileService.ts';
import { MemberGreetingService } from '../services/memberGreetingService.ts';
import { GuildDataResponder } from '../services/guildDataResponder.ts';
import { AppEmojiManager } from '../services/appEmojiManager.ts';
import { BotAdminResponder } from '../services/botAdminResponder.ts';
import { SapphireInterfaceLogger } from './logger.ts';
import { PlayerNotifier } from '../modules/audio/lavalink/player/playerNotifier.ts';
import { CustomPlayer } from '../modules/audio/lavalink/player/customPlayer.ts';

export class BotApplication<T extends boolean> extends SapphireClient<T> {
	private rootData: RootData = getRootData();
	constructor(options: ClientOptions) {
		super({
			...options,
			// 전역 기본 allowedMentions — 트랙 제목처럼 외부에서 들어온 문자열에 멘션 마크업이 섞여도
			// 알림이 울리지 않아요(멘션 주입 방지). 멘션이 필요한 전송(인사 등)은 전송 시점에
			// allowedMentions를 명시해 다시 켜요 (예: memberGreetingService).
			allowedMentions: options.allowedMentions ?? { parse: [], users: [], roles: [], repliedUser: false }
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
		container.ttsService = new TtsService();
		container.ttsUserSettings = new TtsUserSettingsService();
		container.chatTtsService = new ChatTtsService();
		container.tempVoiceService = new TempVoiceService();
		container.aiMemoryService = new AiMemoryService();
		container.ticketService = new TicketService();

		// Redis 구독 서비스군 공용 로거. bootstrap이 start하고 shutdown이 stop한다 (레지스트리 하나로 모은다)
		const subscriberLogger = {
			info: (msg: string) => container.logger.info(msg),
			warn: (msg: string) => container.logger.warn(msg),
			error: (msg: string) => container.logger.error(msg),
			debug: (msg: string) => container.logger.debug(msg)
		};
		// 서비스 간 메시지 서명 키 — REDIS_AUTH_KEY ?? AUTH_KEY (data-api와 공유). 없으면 서명 없는 구버전 모드.
		// (guildSettingsInvalidator는 대시보드가 직접 퍼블리시하는 채널이라 서명 대상이 아니에요)
		const redisSigningKey = resolveRedisSigningKey(process.env);
		container.guildSettingsInvalidator = new GuildSettingsInvalidator(subscriberLogger);
		container.playerWebResponder = new PlayerWebResponder(subscriberLogger, redisSigningKey);
		container.jtcSetupResponder = new JtcSetupResponder(subscriberLogger, redisSigningKey);
		container.botProfileService = new BotProfileService(subscriberLogger, redisSigningKey);
		container.memberGreetingService = new MemberGreetingService(subscriberLogger, redisSigningKey);
		container.guildDataResponder = new GuildDataResponder(subscriberLogger, redisSigningKey);
		container.socialWebhookResponder = new SocialWebhookResponder(subscriberLogger, redisSigningKey);
		container.botAdminResponder = new BotAdminResponder(subscriberLogger, redisSigningKey);
		container.appEmojiManager = new AppEmojiManager();
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
