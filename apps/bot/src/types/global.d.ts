// Audio
import { LavalinkManager } from 'lavalink-client';
import { RedisStore } from '../modules/audio/lavalink/redisStore.ts';
import { PlayerNotifier } from '../modules/audio/lavalink/player/playerNotifier.ts';

// DB Services
import { PrismaClient } from '@sirubot/prisma';
import { GuildService } from '../services/guildService.ts';
import { TrackService } from '../services/trackService.ts';
import { LavalinkHandler } from '../modules/audio/lavalink/handlers/lavalinkHandler.ts';
import { CustomPlayer } from '../modules/audio/lavalink/player/customPlayer.ts';
import type { BotAdminResponder } from '../services/botAdminResponder.ts';

declare module '@sapphire/pieces' {
	interface Container {
		audio: LavalinkManager<CustomPlayer>;
		lavalinkHandler: LavalinkHandler;
		db: PrismaClient;
		redisStore: RedisStore;
		playerNotifier: PlayerNotifier;
		nowPlayingCardStore?: import('../modules/audio/lavalink/player/nowPlayingCard.ts').NowPlayingCardStore;
		playerStatePublishTracker?: Map<string, { at: number; fingerprint: string }>;
		/** 음악 제어 유스케이스 (features/music/application) — 어댑터는 container.music.<op>(actor, ...)로 호출해요 */
		music: import('../features/music/application/control.ts').MusicControl;
		guildService: GuildService;
		trackService: TrackService;
		playlistService: import('../services/playlistService.ts').PlaylistService;
		audioService: import('../services/audioService.ts').AudioService;
		mixerService: import('../services/mixerService.ts').MixerService;
		ttsService: import('../services/ttsService.ts').TtsService;
		ttsUserSettings: import('../services/ttsUserSettings.ts').TtsUserSettingsService;
		ttsPronunciation: import('../services/ttsPronunciation.ts').TtsPronunciationService;
		chatTtsService: import('../services/chatTts.ts').ChatTtsService;
		tempVoiceService: import('../services/tempVoiceService.ts').TempVoiceService;
		aiMemoryService: import('../services/aiMemoryService.ts').AiMemoryService;
		ticketService: import('../features/tickets/index.ts').TicketService;
		rolePanelService: import('../features/role-panels/index.ts').RolePanelService;
		guildSettingsInvalidator: import('../services/guildSettingsInvalidator.ts').GuildSettingsInvalidator;
		playerWebResponder?: import('../services/playerWebResponder.ts').PlayerWebResponder;
		jtcSetupResponder?: import('../services/jtcSetupResponder.ts').JtcSetupResponder;
		botProfileService: import('../services/botProfileService.ts').BotProfileService;
		memberGreetingService: import('../services/memberGreetingService.ts').MemberGreetingService;
		guildDataResponder?: import('../services/guildDataResponder.ts').GuildDataResponder;
		socialWebhookResponder?: import('../services/socialWebhookResponder.ts').SocialWebhookResponder;
		appEmojiManager?: import('../services/appEmojiManager.ts').AppEmojiManager;
		botAdminResponder?: BotAdminResponder;
		panelPostResponder?: import('../services/panelPostResponder.ts').PanelPostResponder;
		roleValidationResponder?: import('../features/role-panels/index.ts').RoleValidationResponder;
		redisSubscribers?: import('../core/redisSubscribers.ts').RedisSubscriberEntry[];
		shardClient?: import('@sirubot/shardclient').ShardClient;
		shardInfo: { shardIds: number[]; shardCount: number };
	}
}

declare module '@sapphire/framework' {
	interface Preconditions {
		ManageGuild: never;
		OwnerOnly: never;

		ClientVoiceConnectable: never;
		ClientVoiceSpeakable: never;
		DJOrAlone: never;
		MemberListenable: never;
		NodeAvailable: never;
		SameVoiceChannel: never;
		SongPlaying: never;
		TextChannelAllowed: never;
		VoiceConnected: never;
	}
}
