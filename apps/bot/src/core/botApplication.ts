import { join } from 'node:path';
import { PrismaClient } from '@sirubot/prisma';
import { PrismaPg } from '@prisma/adapter-pg';

import { SapphireClient } from '@sapphire/framework';
import { RootData, container, getRootData } from '@sapphire/pieces';
import { getConfig } from './config.ts';

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
import { TtsPronunciationService } from '../services/ttsPronunciation.ts';
import { ChatTtsService } from '../services/chatTts.ts';
import { TempVoiceService } from '../services/tempVoiceService.ts';
import { AiMemoryService } from '../services/aiMemoryService.ts';
import { TicketService } from '../features/tickets/index.ts';
import { RolePanelService, RoleValidationResponder } from '../features/role-panels/index.ts';
import { GuildSettingsInvalidator } from '../services/guildSettingsInvalidator.ts';
import { PlayerWebResponder } from '../services/playerWebResponder.ts';
import { JtcSetupResponder } from '../features/temp-voice/index.ts';
import { SocialWebhookResponder } from '../services/socialWebhookResponder.ts';
import { BotProfileService } from '../services/botProfileService.ts';
import { MemberGreetingService } from '../services/memberGreetingService.ts';
import { GuildDataResponder } from '../services/guildDataResponder.ts';
import { AppEmojiManager } from '../services/appEmojiManager.ts';
import { BotAdminResponder } from '../services/botAdminResponder.ts';
import { PanelPostResponder } from '../services/panelPostResponder.ts';
import { SapphireInterfaceLogger } from './logger.ts';
import type { RedisSubscriberEntry } from './redisSubscribers.ts';
import { createMusicAccess } from '../features/music/application/access.ts';
import { createMusicControl } from '../features/music/application/control.ts';
import * as guildPlayback from '../services/guildSettings/playback.ts';
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

	/** `root`는 PIECE_ROOTS의 항목처럼 src 기준 상대 경로예요 (예: `modules/audio`). */
	public setupStore(root: string) {
		this.logger.debug(`Setting up piece root: ${root}`);
		this.stores.registerPath(join(this.rootData.root, root));
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
		const config = getConfig();
		const logLevel = config.logLevel;
		const prismaEventLog: Array<{ level: 'error' | 'warn' | 'info' | 'query'; emit: 'event' }> = [
			{ level: 'error', emit: 'event' },
			{ level: 'warn', emit: 'event' },
			{ level: 'info', emit: 'event' }
		];
		if (logLevel >= 4) prismaEventLog.push({ level: 'query', emit: 'event' });

		const db = new PrismaClient({
			adapter: new PrismaPg({
				connectionString: config.database.url
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
		container.ttsPronunciation = new TtsPronunciationService();
		container.chatTtsService = new ChatTtsService();
		container.tempVoiceService = new TempVoiceService();
		container.aiMemoryService = new AiMemoryService();
		container.ticketService = new TicketService();
		container.rolePanelService = new RolePanelService();

		// Redis 구독 서비스군 공용 로거. bootstrap이 start하고 shutdown이 stop한다 (레지스트리 하나로 모은다)
		const subscriberLogger = {
			info: (msg: string) => container.logger.info(msg),
			warn: (msg: string) => container.logger.warn(msg),
			error: (msg: string) => container.logger.error(msg),
			debug: (msg: string) => container.logger.debug(msg)
		};
		// 서비스 간 메시지 서명 키 — REDIS_AUTH_KEY ?? AUTH_KEY (data-api와 공유). 없으면 서명 없는 구버전 모드.
		// (guildSettingsInvalidator는 대시보드가 직접 퍼블리시하는 채널이라 서명 대상이 아니에요)
		const redisSigningKey = getConfig().redis.signingKey;
		const guildSettingsInvalidator = (container.guildSettingsInvalidator = new GuildSettingsInvalidator(subscriberLogger));
		const playerWebResponder = (container.playerWebResponder = new PlayerWebResponder(subscriberLogger, redisSigningKey));
		const jtcSetupResponder = (container.jtcSetupResponder = new JtcSetupResponder(subscriberLogger, redisSigningKey));
		const botProfileService = (container.botProfileService = new BotProfileService(subscriberLogger, redisSigningKey));
		const memberGreetingService = (container.memberGreetingService = new MemberGreetingService(subscriberLogger, redisSigningKey));
		const guildDataResponder = (container.guildDataResponder = new GuildDataResponder(subscriberLogger, redisSigningKey));
		const socialWebhookResponder = (container.socialWebhookResponder = new SocialWebhookResponder(subscriberLogger, redisSigningKey));
		const botAdminResponder = (container.botAdminResponder = new BotAdminResponder(subscriberLogger, redisSigningKey));
		const panelPostResponder = (container.panelPostResponder = new PanelPostResponder(subscriberLogger, redisSigningKey));
		const roleValidationResponder = (container.roleValidationResponder = new RoleValidationResponder(subscriberLogger, redisSigningKey));

		// Redis 구독 서비스 레지스트리 — 새 서비스는 여기에 한 줄만 추가하면 start/stop이 따라와요.
		// 배열 순서가 start 순서예요 (stop도 같은 순서). 모든 start는 실패해도 부팅을 막지 않아요 (자체 재연결).
		container.redisSubscribers = [
			// 대시보드 설정 저장 → data-api Redis 브로드캐스트 → 봇 GuildService 캐시 무효화.
			// 실패해도 부팅은 계속돼요 — 60초 TTL 폴백이 있어요.
			{
				name: 'guildSettingsInvalidator',
				start: (url) => guildSettingsInvalidator.start(url, container.guildService),
				stop: () => guildSettingsInvalidator.stop()
			},
			// 대시보드 웹 플레이어(검색·재생·제어·음성 상태) 요청 → data-api → Redis → 봇 응답.
			// 실패해도 부팅은 계속돼요 — 대시보드 플레이어 요청이 타임아웃 폴백으로 끝나요.
			{ name: 'playerWebResponder', start: (url) => playerWebResponder.start(url), stop: () => playerWebResponder.stop() },
			// 대시보드 JTC 마커 채널 셋업(생성·이동) → data-api → Redis → 봇 tempVoiceService 수행.
			// 실패해도 부팅은 계속돼요 — 대시보드 설정 요청만 타임아웃 폴백해요.
			{ name: 'jtcSetupResponder', start: (url) => jtcSetupResponder.start(url), stop: () => jtcSetupResponder.stop() },
			// 대시보드 봇 프로필(닉네임·아바타) 저장 → data-api → Redis → 봇 적용.
			// 실패해도 부팅은 계속돼요 — 패널이 상태를 못 받을 뿐이에요.
			{ name: 'botProfileService', start: (url) => botProfileService.start(url), stop: () => botProfileService.stop() },
			// 대시보드 멤버 인사(환영/작별) 테스트 전송 → data-api → Redis → 봇 전송.
			// 실패해도 부팅은 계속돼요 — 실제 입퇴장 인사는 리스너가 이어서 처리해요.
			{ name: 'memberGreetingService', start: (url) => memberGreetingService.start(url), stop: () => memberGreetingService.stop() },
			// 대시보드 채널/역할 목록 요청 → data-api → Redis → 봇 응답.
			// 실패해도 부팅은 계속돼요 — 대시보드 패널 조회만 타임아웃 폴백으로 끝나요.
			{ name: 'guildDataResponder', start: (url) => guildDataResponder.start(url), stop: () => guildDataResponder.stop() },
			// 대시보드 소셜 알림 구독 추가 → notifier → Redis → 봇이 대상 채널에 웹훅 1회 생성.
			// 실패해도 부팅은 계속돼요 — 구독 추가만 타임아웃 폴백해요 (기존 알림 전송은 웹훅이라 무관해요).
			{ name: 'socialWebhookResponder', start: (url) => socialWebhookResponder.start(url), stop: () => socialWebhookResponder.stop() },
			{ name: 'botAdminResponder', start: (url) => botAdminResponder.start(url), stop: () => botAdminResponder.stop() },
			// 대시보드 패널 메시지(티켓·역할 패널) 직접 게시 → data-api → Redis → 봇 게시.
			// 실패해도 부팅은 계속돼요 — 대시보드 직접 게시만 타임아웃 폴백해요.
			{ name: 'panelPostResponder', start: (url) => panelPostResponder.start(url), stop: () => panelPostResponder.stop() },
			// 대시보드 역할 부여 가능 여부 검증 → data-api → Redis → 봇 검증.
			// 실패해도 부팅은 계속돼요 — 대시보드 저장 전 검증만 타임아웃 폴백해요.
			{ name: 'roleValidationResponder', start: (url) => roleValidationResponder.start(url), stop: () => roleValidationResponder.stop() }
		] satisfies RedisSubscriberEntry[];
		container.appEmojiManager = new AppEmojiManager();
		this.setupMusicControl();
	}

	/**
	 * 음악 제어 유스케이스를 한 번만 만들어 container.music으로 노출해요.
	 * 슬래시·버튼·대시보드·AI 도구가 같은 인가 정책과 부수 효과를 거치도록 의존성을 여기서만 엮어요 (container는 호출 시점에 읽어요).
	 */
	private setupMusicControl() {
		container.music = createMusicControl<CustomPlayer>({
			access: createMusicAccess({
				getBotVoiceChannelId: (guildId) =>
					this.guilds.cache.get(guildId)?.members.me?.voice.channelId ?? container.audio.getPlayer(guildId)?.voiceChannelId ?? null,
				getDjRoleId: (guildId) => guildPlayback.getDJRole(container.guildService, guildId)
			}),
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
