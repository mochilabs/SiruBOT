import { join } from 'node:path';
import { PrismaClient } from '@sirubot/prisma';
import { PrismaPg } from '@prisma/adapter-pg';

import { SapphireClient } from '@sapphire/framework';
import { RootData, container, getRootData } from '@sapphire/pieces';
import { getConfig, shouldLogQueries } from '../lib/config.ts';

import { ClientOptions } from 'discord.js';
import { LavalinkManager, LavalinkNodeOptions } from 'lavalink-client';

import { GuildService } from '../services/guildService.ts';
import { ChatTtsService, TtsPronunciationService, TtsService, TtsUserSettingsService, getTtsConfig } from '../features/tts/index.ts';
import { CountingStateStore } from '../services/countingState.ts';
import { BotActivityService } from '../services/botActivity.ts';
import { KeyedTimers } from '../lib/keyedTimers.ts';
import { AiMemoryService, ChannelHistoryStore, MemoryPromotionJobs, createAiChat, createAiTools } from '../features/ai-chat/index.ts';
import { createTicketService, ticketMessages } from '../features/tickets/index.ts';
import { createDataApiClient } from '../services/dataApiClient.ts';
import { WebhookRelay } from '../services/webhookRelay.ts';
import { createCustomCommandStore, createSlashRegistry } from '../features/custom-commands/index.ts';
import { createGameRecords } from '../features/games/index.ts';
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
import { BotProfileService } from '../services/botProfileService.ts';
import { createMemberGreetingService, greetingMessages, createMemberGreetingSendListener } from '../features/greeting/index.ts';
import {
	createBotAdminResponder,
	createBotProfileListeners,
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
import * as guildPlayback from '../services/guildSettings/playback.ts';
import * as guildJtc from '../services/guildSettings/jtc.ts';

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

	/** `root`는 PIECE_ROOTS의 항목처럼 src 기준 상대 경로예요 (예: `features/music/discord`). */
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
				// audio는 setupAudio 뒤에 생겨서 호출 시점에 읽어요
				getAudio: () => container.audio
			}
		);
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
		// 쿼리 이벤트는 쿼리마다 파라미터까지 구성된다 — LOGLEVEL이 debug(2) 이하일 때만 붙인다.
		// (data-api 쪽 클라이언트도 쿼리 로깅을 안 쓴다: apps/data-api/src/services/db.ts)
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
		// 종료 시 stop()이 필요한 상태 소유자 레지스트리 — 소유자를 만들면 container.stoppables에 push해요 (종료 때 병렬로 stop, core/shutdown.ts)
		container.stoppables = [];
		// 애플리케이션 계층과 Redis 수신 계층이 함께 쓰는 로거 — 호출 시점에 container.logger를 읽어요
		const appLogger: AppLogger = {
			info: (msg: string, ...values: unknown[]) => container.logger.info(msg, ...values),
			warn: (msg: string, ...values: unknown[]) => container.logger.warn(msg, ...values),
			error: (msg: string, ...values: unknown[]) => container.logger.error(msg, ...values),
			debug: (msg: string, ...values: unknown[]) => container.logger.debug(msg, ...values)
		};
		const subscriberLogger = appLogger;
		// Lavalink 계층 의존성 — 서비스보다 먼저 만들고 getter로 호출 시점에 읽어요 (mixer·sponsorBlock·playerNotifier는 아래에서 생겨요).
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
		container.trackService = new TrackService({ db: container.db });
		container.playlistService = new PlaylistService({ db: container.db });
		container.audioService = new AudioService({
			logger: appLogger,
			guildService: container.guildService,
			lavalink,
			// audio는 setupAudio 뒤에, client는 로그인 뒤에, mixerService는 이 서비스 뒤에 만들어져서 호출 시점에 읽어요
			getAudio: () => container.audio,
			getClient: () => container.client,
			getMixerService: () => container.mixerService
		});
		container.mixerService = new MixerService({
			logger: appLogger,
			guildService: container.guildService,
			lavalink,
			callTimeoutMs: getConfig().mixer.callTimeoutMs,
			// playerNotifier는 setupAudio에서 만들어져서 호출 시점에 읽어요
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
			// audio는 setupAudio 뒤에 생겨서 호출 시점에 읽어요
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
			// audio는 setupAudio 뒤에 생겨서 호출 시점에 읽어요
			getPlayer: (guildId) => container.audio.getPlayer(guildId)
		});
		container.tempVoiceService = createTempVoiceService({
			logger: appLogger,
			settings: {
				getJtcSettings: (guildId) => guildJtc.getJtcSettings(container.guildService, guildId),
				setJtcCategory: (guildId, categoryId, markerChannelId) =>
					guildJtc.setJtcCategory(container.guildService, guildId, categoryId, markerChannelId)
			},
			// redisStore는 setupServices 뒤(setupRedis)에 만들어지므로 호출 시점에 읽어요
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
			emptyGraceMs: getConfig().tempVoice.emptyGraceMs
		});
		container.stoppables.push(container.chatTtsService, container.tempVoiceService);
		container.voiceLeaveTimers = new KeyedTimers('빈 음성 채널 퇴장 타이머');
		container.botActivity = new BotActivityService({
			activity: getConfig().discord.botActivity,
			getClient: () => container.client,
			// audio는 setupAudio 뒤에 생겨서 호출 시점에 읽어요
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
			// music은 setupServices 끝(setupMusicControl)에, audio는 setupAudio 뒤에 생겨서 호출 시점에 읽어요
			getMusic: () => container.music,
			getMusicPlay: () => container.musicPlay,
			getAudio: () => container.audio,
			getClient: () => container.client,
			getCommands: () => container.stores.get('commands'),
			getSearchConfig: () => getConfig().search
		});
		container.aiChat = createAiChat({
			logger: appLogger,
			guildService: container.guildService,
			memory: container.aiMemoryService,
			history: container.aiChatHistory,
			promotions: memoryPromotions,
			tools: aiTools,
			getClient: () => container.client,
			// audio는 setupAudio 뒤에 생겨서 호출 시점에 읽어요
			getPlayer: (guildId) => container.audio?.getPlayer?.(guildId),
			// redisStore는 setupRedis 뒤에 생겨서 호출 시점에 읽어요
			getRedisStore: () => container.redisStore,
			getContextTokenBudget: () => getConfig().aiChat.contextTokenBudget
		});
		container.countingState = new CountingStateStore({ getRedisStore: () => container.redisStore });
		container.stoppables.push(container.countingState);
		container.playbackReporter = new PlaybackReporter({ logger: appLogger, getClient: () => container.client });
		container.stoppables.push(container.playbackReporter);
		container.customCommandStore = createCustomCommandStore({ db: container.db, logger: appLogger });
		container.customSlashRegistry = createSlashRegistry({
			db: container.db,
			getGuild: (guildId) => container.client.guilds.cache.get(guildId),
			getCoreCommandNames: () => container.stores.get('commands').keys()
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

		// 서비스 간 메시지 서명 키 — REDIS_AUTH_KEY ?? AUTH_KEY (data-api와 공유). 없으면 서명 없는 구버전 모드.
		// (설정 무효화 채널은 대시보드 저장 흐름이 서명 없이 퍼블리시해서 이벤트 계약이 signed: false로 받아요)
		const redisSigningKey = getConfig().redis.signingKey;
		const redisPublisher = new RedisPublisher({ getStore: () => container.redisStore, signingKey: redisSigningKey, logger: subscriberLogger });
		container.botProfileService = new BotProfileService({
			logger: subscriberLogger,
			signingKey: redisSigningKey,
			publisher: redisPublisher,
			// redisStore는 setupServices 뒤(setupRedis)에 만들어지므로 호출 시점에 읽어요
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
			messages: greetingMessages
		});

		const redisRuntime: RedisRuntime = {
			logger: subscriberLogger,
			signingKey: redisSigningKey,
			publisher: redisPublisher,
			resolveGuild: (guildId) => container.client.guilds.cache.get(guildId)
		};
		// 공유 구독 연결 하나에 묶이는 응답자·이벤트 리스너 — 새 응답자는 각 feature의 index.ts에서 내보내 여기에 한 줄만 추가하면 돼요.
		// 모든 start는 실패해도 부팅을 막지 않아요 (공유 구독이 자체 재연결). 연결이 끊기면 대시보드 요청은 타임아웃 폴백으로 끝나요.
		const redisBindings: RedisBinding[] = [
			// 대시보드 설정 저장 → data-api Redis 브로드캐스트 → 봇 GuildService·커스텀 명령어 캐시 무효화 (60초 TTL 폴백이 있어요).
			createGuildSettingsInvalidationListener(),
			// 대시보드 봇 프로필(닉네임·아바타) 저장·최신 상태 조회 → data-api → Redis → 봇 적용·상태 퍼블리시.
			...createBotProfileListeners(),
			// 대시보드 멤버 인사(환영/작별) 테스트 전송 → data-api → Redis → 봇 전송.
			createMemberGreetingSendListener(),
			// 대시보드 웹 플레이어(검색·재생·제어·음성 상태) 요청 → data-api → Redis → 봇 응답.
			createPlayerWebResponder(),
			// 대시보드 JTC 마커 채널 셋업(생성·이동) → data-api → Redis → 봇 tempVoiceService 수행.
			createJtcSetupResponder(),
			// 대시보드 채널/역할 목록 요청 → data-api → Redis → 봇 응답.
			createGuildDataResponder(),
			// 대시보드 소셜 알림 구독 추가 → notifier → Redis → 봇이 대상 채널에 웹훅 1회 생성.
			createSocialWebhookResponder(),
			// 대시보드 관리자 패널(/admin) 제어 → data-api → Redis → 봇 수행 (대표 프로세스만 응답).
			createBotAdminResponder(),
			// 대시보드 패널 메시지(티켓·역할 패널) 직접 게시 → data-api → Redis → 봇 게시.
			createPanelPostResponder(),
			// 대시보드 역할 부여 가능 여부 검증 → data-api → Redis → 봇 검증.
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

	/**
	 * 음악 제어 유스케이스를 한 번만 만들어 container.music으로 노출해요.
	 * 슬래시·버튼·대시보드·AI 도구가 같은 인가 정책과 부수 효과를 거치도록 의존성을 여기서만 엮어요 (container는 호출 시점에 읽어요).
	 */
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

	/**
	 * 투표 건너뛰기 유스케이스를 한 번만 만들어 container.voteSkip으로 노출해요.
	 * 허용 판정은 여기서, 실제 건너뛰기는 container.music.skipApproved(인가 없이 mixer 스킵)로 보내요. 플레이어 상태는 호출 시점에 읽어요.
	 */
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

	/** 봇 음성 채널과 DJ 역할 조회 — 음악 제어·곡 추가 인가가 같은 원천을 써요. */
	private musicAccessDeps() {
		return {
			getBotVoiceChannelId: (guildId: string) =>
				this.guilds.cache.get(guildId)?.members.me?.voice.channelId ?? container.audio.getPlayer(guildId)?.voiceChannelId ?? null,
			getDjRoleId: (guildId: string) => guildPlayback.getDJRole(container.guildService, guildId)
		};
	}

	/**
	 * 곡 검색·대기열 추가 유스케이스를 한 번만 만들어 container.musicPlay로 노출해요 (슬래시 /재생·/검색, 고정 채널, AI music_play, 웹 플레이어).
	 * 플레이어·검색·접속 같은 재생 메커니즘은 audioService가 맡고, 여기서는 그 함수들을 좁은 포트로 넘겨요.
	 */
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
