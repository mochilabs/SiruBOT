// Audio
import { LavalinkManager } from 'lavalink-client';
import type {
	AudioService,
	CustomPlayer,
	LavalinkHandler,
	MixerService,
	LavalinkDeps,
	MusicControl,
	PlaybackReporter,
	PlayerNotifier,
	PlaylistPlayback,
	PlaylistService,
	RedisStore,
	SponsorBlockService,
	TrackService,
	VoteSkipService
} from '../features/music/index.ts';

// DB Services
import { PrismaClient } from '@sirubot/prisma';
import { GuildService } from '../services/guildService.ts';

declare module '@sapphire/pieces' {
	interface Container {
		audio: LavalinkManager<CustomPlayer>;
		lavalinkHandler: LavalinkHandler;
		db: PrismaClient;
		redisStore: RedisStore;
		playerNotifier: PlayerNotifier;
		/** Lavalink 계층(핸들러·플레이어 알림·Redis 저장소)의 명시적 의존성 묶음 — features/music/lavalink/deps.ts */
		lavalink: LavalinkDeps;
		/** 음악 제어 유스케이스 (features/music/application) — 어댑터는 container.music.<op>(actor, ...)로 호출해요 */
		music: MusicControl;
		/** 곡 검색·대기열 추가 유스케이스 (features/music/application/play.ts) — 진입점(슬래시·고정 채널·웹·AI)이 같이 써요 */
		musicPlay: import('../features/music/application/play.ts').MusicPlayService;
		guildService: GuildService;
		trackService: TrackService;
		playlistService: PlaylistService;
		audioService: AudioService;
		mixerService: MixerService;
		/** SponsorBlock 구간 조회·건너뛰기 소유자 (플레이어별 상태는 WeakMap) */
		sponsorBlockService: SponsorBlockService;
		/** 저장한 플레이리스트·즐겨찾기 재생 (features/music/application/playlistPlayback.ts) */
		playlistPlayback: PlaylistPlayback;
		/** 건너뛰기 허용 판정(강제·요청자·추천곡·단독·투표)과 진행 중인 투표 소유자 (features/music/application/voteSkip.ts) */
		voteSkip: VoteSkipService;
		ttsService: import('../features/tts/index.ts').TtsService;
		ttsUserSettings: import('../features/tts/index.ts').TtsUserSettingsService;
		ttsPronunciation: import('../features/tts/index.ts').TtsPronunciationService;
		chatTtsService: import('../features/tts/index.ts').ChatTtsService;
		tempVoiceService: import('../features/temp-voice/index.ts').TempVoiceService;
		/** AI 채팅 기록 인메모리 상태 + 디바운스 DB 저장 소유자 (종료 시 stop()이 flush) */
		aiChatHistory: import('../features/ai-chat/index.ts').ChannelHistoryStore;
		/** 카운팅 채널 상태(샤드 메모리 + Redis write-behind) 소유자 */
		countingState: import('../features/counting/index.ts').CountingStateStore;
		/** 재생 이벤트 data-api 리포트 소유자 — 진행 중인 요청을 종료 때 기다려요 */
		playbackReporter: PlaybackReporter;
		/** 빈 음성 채널 퇴장 유예 타이머 소유자 (길드별) */
		voiceLeaveTimers: import('../lib/keyedTimers.ts').KeyedTimers;
		/** 봇 상태 메시지 순환 인터벌 소유자 */
		botActivity: import('../services/botActivity.ts').BotActivityService;
		/** AI 채팅 진입점 묶음(턴 실행·정책·턴 확보) — features/ai-chat/application/aiChatService.ts */
		aiChat: import('../features/ai-chat/index.ts').AiChat;
		aiMemoryService: import('../features/ai-chat/index.ts').AiMemoryService;
		/** 커스텀 명령어 캐시 소유자 (features/custom-commands/application/store.ts) */
		customCommandStore: import('../features/custom-commands/index.ts').CustomCommandStore;
		/** 커스텀 슬래시 명령어 길드 동기화 소유자 (features/custom-commands/application/slashRegistry.ts) */
		customSlashRegistry: import('../features/custom-commands/index.ts').SlashRegistry;
		gameRecords: import('../features/games/index.ts').GameRecords;
		ticketService: import('../features/tickets/index.ts').TicketService;
		rolePanelService: import('../features/role-panels/index.ts').RolePanelService;
		/** 로거가 필요한 data-api 호출(이미지 렌더·업로드) — services/dataApiClient.ts */
		dataApi: import('../services/dataApiClient.ts').DataApiClient;
		/** 임베드 복구용 채널 웹훅 릴레이(웹훅 캐시 소유자) */
		webhookRelay: import('../services/webhookRelay.ts').WebhookRelay;
		botProfileService: import('../features/bot-profile/index.ts').BotProfileService;
		memberGreetingService: import('../features/greeting/index.ts').MemberGreetingService;
		appEmojiManager?: import('../services/appEmojiManager.ts').AppEmojiManager;
		/** 종료 시 stop()이 필요한 상태 소유자 레지스트리 — setupServices가 채우고 shutdown이 Redis/DB를 닫기 전에 실행해요 */
		stoppables: import('../lib/lifecycle.ts').Stoppable[];
		redisSubscribers?: import('../core/redisSubscribers.ts').RedisSubscriberEntry[];
		shardClient?: import('@sirubot/shardclient').ShardClient;
		shardInfo: { shardIds: number[]; shardCount: number };
	}
}

declare module '@sapphire/framework' {
	interface Preconditions {
		ManageGuild: never;
		OwnerOnly: never;

		DJOrAlone: never;
		MemberListenable: never;
		NodeAvailable: never;
		SameVoiceChannel: never;
		SongPlaying: never;
		TextChannelAllowed: never;
		VoiceConnected: never;
	}
}
