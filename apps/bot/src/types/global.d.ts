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
	TrackSuggestionService,
	VoteSkipService
} from '../features/music/index.ts';

import { PrismaClient } from '@sirubot/prisma';
import { GuildService } from '../services/guildService.ts';

declare module '@sapphire/pieces' {
	interface Container {
		audio: LavalinkManager<CustomPlayer>;
		lavalinkHandler: LavalinkHandler;
		db: PrismaClient;
		redisStore: RedisStore;
		playerNotifier: PlayerNotifier;
		lavalink: LavalinkDeps;
		music: MusicControl;
		musicPlay: import('../features/music/application/play.ts').MusicPlayService;
		guildService: GuildService;
		trackService: TrackService;
		trackSuggestions: TrackSuggestionService;
		playlistService: PlaylistService;
		audioService: AudioService;
		mixerService: MixerService;
		sponsorBlockService: SponsorBlockService;
		playlistPlayback: PlaylistPlayback;
		voteSkip: VoteSkipService;
		ttsService: import('../features/tts/index.ts').TtsService;
		ttsUserSettings: import('../features/tts/index.ts').TtsUserSettingsService;
		ttsPronunciation: import('../features/tts/index.ts').TtsPronunciationService;
		chatTtsService: import('../features/tts/index.ts').ChatTtsService;
		tempVoiceService: import('../features/temp-voice/index.ts').TempVoiceService;
		aiChatHistory: import('../features/ai-chat/index.ts').ChannelHistoryStore;
		countingState: import('../features/counting/index.ts').CountingStateStore;
		scheduledMessages: import('../features/scheduled-messages/index.ts').ScheduledMessageService;
		birthday: import('../features/birthday/index.ts').BirthdayService;
		giveaways: import('../features/giveaway/index.ts').GiveawayService;
		starboardService: import('../features/starboard/index.ts').StarboardService;
		playbackReporter: PlaybackReporter;
		incidentNotice: import('../services/incidentNotice.ts').IncidentNoticeService;
		guildLifecycle: import('../services/guildLifecycle.ts').GuildLifecycleService;
		usageRecorder: import('../features/usage-metrics/index.ts').UsageRecorder;
		guildJobScheduler: import('../services/guildJobScheduler.ts').GuildJobScheduler;
		voiceLeaveTimers: import('../lib/keyedTimers.ts').KeyedTimers;
		botActivity: import('../services/botActivity.ts').BotActivityService;
		aiChat: import('../features/ai-chat/index.ts').AiChat;
		aiMemoryService: import('../features/ai-chat/index.ts').AiMemoryService;
		customCommandStore: import('../features/custom-commands/index.ts').CustomCommandStore;
		customSlashRegistry: import('../features/custom-commands/index.ts').SlashRegistry;
		gameRecords: import('../features/games/index.ts').GameRecords;
		emojiMaker: import('../features/emoji-maker/index.ts').EmojiMaker;
		ticketService: import('../features/tickets/index.ts').TicketService;
		rolePanelService: import('../features/role-panels/index.ts').RolePanelService;
		dataApi: import('../services/dataApiClient.ts').DataApiClient;
		webhookRelay: import('../services/webhookRelay.ts').WebhookRelay;
		botProfileService: import('../features/bot-profile/index.ts').BotProfileService;
		memberGreetingService: import('../features/greeting/index.ts').MemberGreetingService;
		appEmojiManager?: import('../services/appEmojiManager.ts').AppEmojiManager;
		stoppables: import('../lib/lifecycle.ts').Stoppable[];
		redisSubscribers?: import('../core/redisSubscribers.ts').RedisSubscriberEntry[];
		shardClient?: import('@sirubot/shardclient').ShardClient;
		shardInfo: { shardIds: number[]; shardCount: number };
	}
}

declare module '@sapphire/framework' {
	interface Preconditions {
		ManageGuild: never;
		ModuleEnabled: never;
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
