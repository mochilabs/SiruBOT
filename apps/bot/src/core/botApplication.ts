import { hostname } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@sirubot/prisma';
import { PrismaPg } from '@prisma/adapter-pg';

import { SapphireClient } from '@sapphire/framework';
import { RootData, container, getRootData } from '@sapphire/pieces';
import { getConfig, shouldLogQueries } from '../lib/config.ts';

import { ClientOptions } from 'discord.js';
import { LavalinkManager, LavalinkNodeOptions } from 'lavalink-client';

import { GuildService } from '../services/guildService.ts';
import { setContextThemeResolver } from '@sirubot/utils';
import { currentGuildTheme } from '../lib/guildTheme.ts';
import { inGuildTheme } from '../lib/guildThemeScope.ts';
import { ChatTtsService, TtsPronunciationService, TtsService, TtsUserSettingsService, getTtsConfig } from '../features/tts/index.ts';
import { CountingStateStore } from '../features/counting/index.ts';
import { UsageRecorder } from '../features/usage-metrics/index.ts';
import { usageFeatureKey } from '@sirubot/utils/modules';
import { createGuildLifecycleService } from '../services/guildLifecycle.ts';
import { GuildJobScheduler } from '../services/guildJobScheduler.ts';
import { createIncidentNoticeService } from '../services/incidentNotice.ts';
import { BotActivityService } from '../services/botActivity.ts';
import { KeyedTimers } from '../lib/keyedTimers.ts';
import { fetchCommandIndex } from '../discord/utils/commandMentions.ts';
import { AiMemoryService, ChannelHistoryStore, MemoryPromotionJobs, createAiChat, createAiTools } from '../features/ai-chat/index.ts';
import { createTicketService, ticketMessages } from '../features/tickets/index.ts';
import { createDataApiClient } from '../services/dataApiClient.ts';
import { WebhookRelay } from '../services/webhookRelay.ts';
import { createCustomCommandStore, createSlashRegistry } from '../features/custom-commands/index.ts';
import { createGameRecords } from '../features/games/index.ts';
import {
	createEmojiMaker,
	createImageReader,
	createMojiClient,
	createPromptTranslator,
	getMojiConfig,
	getTranslatorLlmConfig
} from '../features/emoji-maker/index.ts';
import { createRolePanelService, rolePanelMessages, createRoleValidationResponder } from '../features/role-panels/index.ts';
import {
	AudioService,
	CustomPlayer,
	MixerService,
	NodeSessionStore,
	PlaybackReporter,
	PlayerNotifier,
	PlaylistService,
	RedisStore,
	SponsorBlockService,
	TrackService,
	autoPlayRelated,
	createMusicAccess,
	createMusicControl,
	createMusicPlay,
	createPlayerWebResponder,
	createVoteSkip,
	getUserQueuedTracks,
	requesterIdOf,
	RELATED_TRACK_REQUESTER_ID,
	type MusicPlayServiceDeps,
	createPlaylistPlayback,
	playbackMessages,
	handleMixerNeedNext,
	CurrentBpmCache,
	createMusicToolPort,
	type LavalinkDeps,
	type LavalinkLogger,
	type LavalinkShardInfo
} from '../features/music/index.ts';
import { createJtcSetupResponder, createTempVoiceService, tempVoiceMessages } from '../features/temp-voice/index.ts';
import { BotProfileService, createBotProfileListeners } from '../features/bot-profile/index.ts';
import { createStarboardService, createStarboardDiscord } from '../features/starboard/index.ts';
import { createScheduledMessageService, createScheduledMessageDiscord } from '../features/scheduled-messages/index.ts';
import { createGiveawayService, createGiveawayDiscord, createGiveawayManageResponder } from '../features/giveaway/index.ts';
import { createMemberGreetingService, greetingMessages, createMemberGreetingSendListener } from '../features/greeting/index.ts';
import { createBirthdayService, createBirthdayDiscord } from '../features/birthday/index.ts';
import {
	createBotAdminResponder,
	createGuildDataResponder,
	createGuildSettingsInvalidationListener,
	createPanelPostResponder,
	createSocialWebhookResponder
} from '../features/dashboard-bridge/index.ts';
import { AppEmojiManager } from '../services/appEmojiManager.ts';
import { SapphireInterfaceLogger } from './logger.ts';
import type { AppLogger } from '../lib/appLogger.ts';
import { RedisPublisher } from '../lib/redisPublisher.ts';
import type { RedisBinding, RedisRuntime } from '../lib/redisResponder.ts';
import { createSharedRedisSubscriber, type RedisSubscriberEntry } from './redisSubscribers.ts';
import * as guildChannels from '../services/guildSettings/channels.ts';
import * as guildPlayback from '../services/guildSettings/playback.ts';
import * as guildJtc from '../services/guildSettings/jtc.ts';
import { isMessageFeatureEnabled } from '../services/guildSettings/modules.ts';

export class BotApplication<T extends boolean> extends SapphireClient<T> {
	private rootData: RootData = getRootData();
	constructor(options: ClientOptions) {
		super({
			...options,
			// 트랙 제목 등 외부 문자열의 멘션 주입을 막기 위해 전역 기본값을 비워요.
			allowedMentions: options.allowedMentions ?? { parse: [], users: [], roles: [], repliedUser: false }
		});
	}

	public setupStore(root: string) {
		this.logger.debug(`Setting up piece root: ${root}`);
		this.stores.registerPath(join(this.rootData.root, root));
	}

	public async setupRedis(url: string) {
		const redisStore = new RedisStore(
			{
				url
			},
			{
				logger: this.logger as SapphireInterfaceLogger,
				getAudio: () => container.audio
			}
		);
		try {
			await redisStore.connect();
		} catch (error) {
			this.logger.warn(`Redis connection failed, continuing in memory-only mode: ${error}`);
		}

		container.redisStore = redisStore;

		return redisStore;
	}

	public async setupDatabase(): Promise<PrismaClient> {
		// LOGLEVEL이 debug 이하일 때만 쿼리 파라미터 구성 비용을 감수하고 query 이벤트를 연결해요.
		const config = getConfig();
		const logQueries = shouldLogQueries(config.logLevel);
		const prismaEventLog: Array<{ level: 'error' | 'warn' | 'info' | 'query'; emit: 'event' }> = [
			{ level: 'error', emit: 'event' },
			{ level: 'warn', emit: 'event' },
			{ level: 'info', emit: 'event' }
		];
		if (logQueries) prismaEventLog.push({ level: 'query', emit: 'event' });

		const db = new PrismaClient({
			adapter: new PrismaPg({
				connectionString: config.database.url
			}),
			log: prismaEventLog
		});

		const subLogger = (this.logger as SapphireInterfaceLogger).getSubLogger({ name: 'prisma' });
		if (logQueries) db.$on('query', (e) => subLogger.debug(e.query));
		db.$on('info', (e) => subLogger.info(e.message));
		db.$on('warn', (e) => subLogger.warn(e.message));
		db.$on('error', (e) => subLogger.error(e.message));

		await db.$connect();
		container.db = db;

		return db;
	}

	public setupServices() {
		container.stoppables = [];
		const appLogger: AppLogger = {
			info: (msg: string, ...values: unknown[]) => container.logger.info(msg, ...values),
			warn: (msg: string, ...values: unknown[]) => container.logger.warn(msg, ...values),
			error: (msg: string, ...values: unknown[]) => container.logger.error(msg, ...values),
			debug: (msg: string, ...values: unknown[]) => container.logger.debug(msg, ...values)
		};
		const subscriberLogger = appLogger;
		const lavalinkLogger: LavalinkLogger = {
			...appLogger,
			getSubLogger: (settings) => (container.logger as SapphireInterfaceLogger).getSubLogger(settings)
		};
		const lavalink: LavalinkDeps = {
			logger: lavalinkLogger,
			get guildService() {
				return container.guildService;
			},
			get trackService() {
				return container.trackService;
			},
			get dataApi() {
				return container.dataApi;
			},
			get chatTtsService() {
				return container.chatTtsService;
			},
			get playbackReporter() {
				return container.playbackReporter;
			},
			get incidentNotice() {
				return container.incidentNotice;
			},
			get sponsorBlockService() {
				return container.sponsorBlockService;
			},
			get mixerService() {
				return container.mixerService;
			},
			get playerNotifier() {
				return container.playerNotifier;
			},
			get audio() {
				return container.audio;
			},
			get client() {
				return container.client;
			},
			get redisStore() {
				return container.redisStore;
			},
			get shardInfo(): LavalinkShardInfo | undefined {
				return container.shardInfo;
			},
			nowPlayingCards: { cache: new Map(), pending: new Map(), retryAfter: new Map() },
			playerStatePublishTracker: new Map(),
			relatedFetchInFlight: new Map(),
			currentBpm: new CurrentBpmCache()
		};
		container.lavalink = lavalink;
		container.dataApi = createDataApiClient({ logger: appLogger });
		container.webhookRelay = new WebhookRelay({ logger: appLogger, getBotUser: () => container.client.user });
		container.guildService = new GuildService({ db: container.db });
		setContextThemeResolver(currentGuildTheme);
		container.trackService = new TrackService({ db: container.db });
		container.playlistService = new PlaylistService({ db: container.db });
		container.audioService = new AudioService({
			logger: appLogger,
			guildService: container.guildService,
			lavalink,
			getAudio: () => container.audio,
			getClient: () => container.client,
			getMixerService: () => container.mixerService,
			getDefaultTextChannel: (guildId) => guildChannels.getDefaultTextChannel(container.guildService, guildId)
		});
		container.mixerService = new MixerService({
			logger: appLogger,
			guildService: container.guildService,
			lavalink,
			callTimeoutMs: getConfig().mixer.callTimeoutMs,
			getPlayerNotifier: () => container.playerNotifier
		});
		container.sponsorBlockService = new SponsorBlockService({
			logger: appLogger,
			guildService: container.guildService,
			messages: playbackMessages,
			getClient: () => container.client,
			getMixerService: () => container.mixerService,
			lavalink,
			armNextTrack: (player, event) => handleMixerNeedNext(lavalink, player, event)
		});
		container.playlistPlayback = createPlaylistPlayback({
			guildService: container.guildService,
			audioService: container.audioService,
			getAudio: () => container.audio
		});
		container.ttsService = new TtsService({ logger: appLogger, getTtsConfig });
		container.ttsUserSettings = new TtsUserSettingsService({ db: container.db, logger: appLogger });
		container.ttsPronunciation = new TtsPronunciationService({ db: container.db, logger: appLogger });
		container.chatTtsService = new ChatTtsService({
			logger: appLogger,
			tts: container.ttsService,
			pronunciation: container.ttsPronunciation,
			mixer: container.mixerService,
			playback: container.audioService,
			guildService: container.guildService,
			getPlayer: (guildId) => container.audio.getPlayer(guildId)
		});
		container.tempVoiceService = createTempVoiceService({
			logger: appLogger,
			settings: {
				getJtcSettings: (guildId) => guildJtc.getJtcSettings(container.guildService, guildId),
				setJtcCategory: (guildId, categoryId, markerChannelId) =>
					guildJtc.setJtcCategory(container.guildService, guildId, categoryId, markerChannelId)
			},
			roomStore: {
				getFields: (key) => container.redisStore.getCacheHashFields(key),
				setFields: (key, fields) => container.redisStore.setCacheHashFields(key, fields),
				deleteField: (key, field) => container.redisStore.deleteCacheHashField(key, field)
			},
			discord: {
				guildIds: () => [...container.client.guilds.cache.keys()],
				fetchGuild: (guildId) => container.client.guilds.fetch(guildId),
				fetchChannel: (channelId) => container.client.channels.fetch(channelId)
			},
			messages: tempVoiceMessages,
			emptyGraceMs: getConfig().tempVoice.emptyGraceMs,
			recordUsage: (guildId, userId) => container.usageRecorder?.record(guildId, usageFeatureKey('msg', 'temp-voice'), userId),
			isEnabled: (guildId) => isMessageFeatureEnabled(container.guildService, guildId, 'temp-voice')
		});
		container.stoppables.push(container.chatTtsService, container.tempVoiceService);
		container.voiceLeaveTimers = new KeyedTimers('빈 음성 채널 퇴장 타이머');
		container.botActivity = new BotActivityService({
			activity: getConfig().discord.botActivity,
			getClient: () => container.client,
			getPlayerCount: () => container.audio?.players?.size ?? 0
		});
		container.stoppables.push(container.voiceLeaveTimers, container.botActivity);
		container.aiMemoryService = new AiMemoryService({ db: container.db });
		container.aiChatHistory = new ChannelHistoryStore({
			db: container.db,
			logger: appLogger,
			getContextTokenBudget: () => getConfig().aiChat.contextTokenBudget
		});
		const memoryPromotions = new MemoryPromotionJobs();
		container.stoppables.push(container.aiChatHistory, memoryPromotions);
		const aiTools = createAiTools({
			db: container.db,
			guildService: container.guildService,
			musicPort: createMusicToolPort({ lavalink }),
			aiMemory: container.aiMemoryService,
			audioService: container.audioService,
			mixerService: container.mixerService,
			sponsorBlock: container.sponsorBlockService,
			playlistService: container.playlistService,
			tempVoice: container.tempVoiceService,
			getMusic: () => container.music,
			getMusicPlay: () => container.musicPlay,
			getAudio: () => container.audio,
			getClient: () => container.client,
			getCommands: () => container.stores.get('commands'),
			fetchCommandIndex,
			getSearchConfig: () => getConfig().search,
			syncTextChannelPanel: (guildId, previousChannelId) => container.playerNotifier.syncPanel(guildId, previousChannelId)
		});
		container.aiChat = createAiChat({
			logger: appLogger,
			guildService: container.guildService,
			memory: container.aiMemoryService,
			history: container.aiChatHistory,
			promotions: memoryPromotions,
			tools: aiTools,
			getClient: () => container.client,
			getPlayer: (guildId) => container.audio?.getPlayer?.(guildId),
			getRedisStore: () => container.redisStore,
			getContextTokenBudget: () => getConfig().aiChat.contextTokenBudget
		});
		container.countingState = new CountingStateStore({ getRedisStore: () => container.redisStore });
		container.stoppables.push(container.countingState);
		container.playbackReporter = new PlaybackReporter({
			logger: appLogger,
			getClient: () => container.client,
			recordUsage: (guildId, type) => container.usageRecorder?.record(guildId, usageFeatureKey('playback', type))
		});
		container.stoppables.push(container.playbackReporter);
		container.incidentNotice = createIncidentNoticeService({
			getRedisStore: () => container.redisStore,
			signingKey: getConfig().redis.signingKey,
			logger: appLogger
		});
		container.guildLifecycle = createGuildLifecycleService({ db: container.db });
		container.usageRecorder = new UsageRecorder({
			db: container.db,
			firstUse: container.guildLifecycle,
			logger: appLogger
		});
		container.stoppables.push(container.usageRecorder);
		container.guildJobScheduler = new GuildJobScheduler({
			db: container.db,
			getOwnedGuildIds: () => [...container.client.guilds.cache.keys()],
			logger: appLogger,
			processId: `${hostname()}:${process.pid}`,
			runInGuild: inGuildTheme
		});
		container.stoppables.push(container.guildJobScheduler);
		container.starboardService = createStarboardService({
			db: container.db,
			logger: appLogger,
			discord: createStarboardDiscord({ getClient: () => container.client, logger: appLogger }),
			recordUsage: (guildId) => container.usageRecorder?.record(guildId, usageFeatureKey('msg', 'starboard'))
		});
		container.stoppables.push(container.starboardService);
		container.scheduledMessages = createScheduledMessageService({
			db: container.db,
			scheduler: container.guildJobScheduler,
			logger: appLogger,
			discord: createScheduledMessageDiscord({ getClient: () => container.client, logger: appLogger })
		});
		container.giveaways = createGiveawayService({
			db: container.db,
			scheduler: container.guildJobScheduler,
			logger: appLogger,
			discord: createGiveawayDiscord({ getClient: () => container.client, logger: appLogger })
		});
		container.stoppables.push(container.giveaways);
		container.customCommandStore = createCustomCommandStore({ db: container.db, logger: appLogger });
		container.customSlashRegistry = createSlashRegistry({
			db: container.db,
			getGuild: (guildId) => container.client.guilds.cache.get(guildId),
			getCoreCommandNames: () => container.stores.get('commands').keys()
		});
		container.emojiMaker = createEmojiMaker({
			logger: appLogger,
			client: createMojiClient({ getMojiConfig }),
			translator: createPromptTranslator({ logger: appLogger, getLlmConfig: getTranslatorLlmConfig }),
			imageReader: createImageReader({ logger: appLogger, getLlmConfig: getTranslatorLlmConfig })
		});
		container.gameRecords = createGameRecords({ db: container.db, getLockStore: () => container.redisStore });
		container.ticketService = createTicketService({
			db: container.db,
			logger: appLogger,
			messages: ticketMessages,
			uploadObject: container.dataApi.uploadObject
		});
		container.rolePanelService = createRolePanelService({ db: container.db, logger: appLogger, messages: rolePanelMessages });
		container.stoppables.push(container.ticketService);

		// REDIS_AUTH_KEY ?? AUTH_KEY; 미설정 시 서명 없는 구버전 모드로 동작해요.
		const redisSigningKey = getConfig().redis.signingKey;
		const redisPublisher = new RedisPublisher({ getStore: () => container.redisStore, signingKey: redisSigningKey, logger: subscriberLogger });
		container.botProfileService = new BotProfileService({
			logger: subscriberLogger,
			signingKey: redisSigningKey,
			publisher: redisPublisher,
			getRedisStore: () => container.redisStore,
			getGuild: (guildId) => container.client.guilds.cache.get(guildId),
			getBotUsername: () => container.client.user?.username
		});
		container.memberGreetingService = createMemberGreetingService({
			logger: subscriberLogger,
			signingKey: redisSigningKey,
			publisher: redisPublisher,
			getPendingStore: () => container.redisStore,
			getGuild: (guildId) => container.client.guilds.cache.get(guildId),
			getGuildSettings: (guildId) => container.guildService.getGuild(guildId),
			renderMemberCard: container.dataApi.renderMemberCard,
			messages: greetingMessages,
			recordUsage: (guildId, userId) => container.usageRecorder?.record(guildId, usageFeatureKey('msg', 'greeting'), userId)
		});

		container.birthday = createBirthdayService({
			db: container.db,
			scheduler: container.guildJobScheduler,
			logger: appLogger,
			discord: createBirthdayDiscord({
				getClient: () => container.client,
				logger: appLogger,
				renderMemberCard: container.dataApi.renderMemberCard,
				messages: greetingMessages
			}),
			isFeatureEnabled: (guildId) => isMessageFeatureEnabled(container.guildService, guildId, 'birthday'),
			recordUsage: (guildId) => container.usageRecorder?.record(guildId, usageFeatureKey('msg', 'birthday'))
		});

		const redisRuntime: RedisRuntime = {
			logger: subscriberLogger,
			signingKey: redisSigningKey,
			publisher: redisPublisher,
			resolveGuild: (guildId) => container.client.guilds.cache.get(guildId)
		};
		const redisBindings: RedisBinding[] = [
			createGuildSettingsInvalidationListener(),
			...createBotProfileListeners(),
			createMemberGreetingSendListener(),
			createPlayerWebResponder(),
			createJtcSetupResponder(),
			createGuildDataResponder(),
			createSocialWebhookResponder(),
			createBotAdminResponder(),
			createPanelPostResponder(),
			createGiveawayManageResponder(() => container.giveaways),
			createRoleValidationResponder()
		];
		container.redisSubscribers = [
			createSharedRedisSubscriber({ name: '대시보드 연동', logger: subscriberLogger, runtime: redisRuntime, bindings: redisBindings })
		] satisfies RedisSubscriberEntry[];
		container.appEmojiManager = new AppEmojiManager({ logger: appLogger, getApplication: () => container.client.application });
		container.stoppables.push(container.appEmojiManager);
		this.setupMusicControl();
		this.setupVoteSkip();
		this.setupMusicPlay();
	}

	private setupMusicControl() {
		container.music = createMusicControl<CustomPlayer>({
			access: createMusicAccess(this.musicAccessDeps()),
			getPlayer: (guildId) => container.audio.getPlayer(guildId),
			settings: {
				saveVolume: async (guildId, volume) => (await guildPlayback.updateVolume(container.guildService, guildId, volume)).volume,
				saveRepeat: (guildId, mode) => guildPlayback.setRepeat(container.guildService, guildId, mode)
			},
			mixer: {
				clearNext: (player) => container.mixerService.clearNext(player),
				skip: (player, position) => container.mixerService.skip(player, position)
			},
			playback: {
				ensurePlayback: (player) => container.audioService.ensurePlayback(player),
				stopPlayback: (player) => container.audioService.stopPlayback(player),
				removeController: (player) => container.playerNotifier.deleteController(player),
				playPrevious: (player) => container.audioService.playPrevious(player)
			}
		});
	}

	private setupVoteSkip() {
		container.voteSkip = createVoteSkip({
			playback: (guildId) => {
				const player = container.audio.getPlayer(guildId);
				if (!player) return undefined;
				const current = player.queue.current;
				return {
					connected: player.connected ?? false,
					current: current ? { identifier: current.info.identifier, requesterId: requesterIdOf(current) } : null,
					queueLength: player.queue.tracks.length,
					userQueuedCount: getUserQueuedTracks(player).length
				};
			},
			getDjRoleId: (guildId) => guildPlayback.getDJRole(container.guildService, guildId),
			getBotUserId: () => container.client.user?.id,
			relatedRequesterId: RELATED_TRACK_REQUESTER_ID,
			music: { skipApproved: (guildId, options) => container.music.skipApproved(guildId, options) }
		});
	}

	private musicAccessDeps() {
		return {
			getBotVoiceChannelId: (guildId: string) =>
				this.guilds.cache.get(guildId)?.members.me?.voice.channelId ?? container.audio.getPlayer(guildId)?.voiceChannelId ?? null,
			getDjRoleId: (guildId: string) => guildPlayback.getDJRole(container.guildService, guildId)
		};
	}

	private setupMusicPlay() {
		const deps: MusicPlayServiceDeps = {
			access: this.musicAccessDeps(),
			getOrCreatePlayer: (guildId, voiceChannelId, textChannelId, options) =>
				container.audioService.getOrCreatePlayer(guildId, voiceChannelId, textChannelId, options),
			search: (player, query, platform, requester) => container.audioService.search(player, query, platform, requester),
			searchWithoutPlayer: (query, platform, requester) => container.audioService.searchWithoutPlayer(query, platform, requester),
			connect: (player) => container.audioService.connectPlayer(player),
			enqueue: (player, tracks) => container.audioService.enqueueTrack(player, tracks),
			ensurePlayback: (player) => container.audioService.ensurePlayback(player)
		};
		container.musicPlay = createMusicPlay(deps);
	}

	public async setupAudio(nodes: LavalinkNodeOptions[], shardInfo: { shardIds: number[]; shardCount: number }) {
		const sessionStore = container.redisStore.getNodeSessionStore();
		const shardKey = NodeSessionStore.makeShardKey(shardInfo.shardIds);

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
					autoPlayFunction: (player, lastPlayedTrack) => autoPlayRelated(container.lavalink, player, lastPlayedTrack)
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
		container.playerNotifier = new PlayerNotifier(container.lavalink);
		container.stoppables.push(container.playerNotifier);
		container.audio = audio;

		return audio;
	}
}
