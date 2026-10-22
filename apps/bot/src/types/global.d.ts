// General
import { ArrayString } from '@skyra/env-utilities';

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

/**
 * @skyra/env-utilities의 envParse* 타입 선언 — 호출부(envParseString/envParseArray)의 타입용이에요.
 * 키 목록·형식·필수 여부의 단일 원본은 core/env.ts의 zod 스키마예요 — 키를 추가·수정할 땐 두 곳을 함께 고쳐요.
 */
declare module '@skyra/env-utilities' {
	interface Env {
		DISCORD_TOKEN: string;
		OWNERS: ArrayString;
		LAVALINK_HOSTS: string;
		LAVALINK_DEFAULT_PASSWORD?: string;
		BOT_ACTIVITY: string;
		LOGLEVEL: string;
		REDIS_URL: string;
		DATABASE_URL: string;
		DEV_GUILD_IDS: ArrayString;
		REGISTER_COMMANDS?: string;
		SHARD_MANAGER_URL?: string;
		AUTH_KEY?: string;
		SENTRY_DSN?: string;
		SIRU_TTS_URL?: string;
		SIRU_TTS_API_KEY?: string;
		SIRU_TTS_DEFAULT_VOICE?: string;
	}
}

declare module '@sapphire/pieces' {
	interface Container {
		audio: LavalinkManager<CustomPlayer>;
		lavalinkHandler: LavalinkHandler;
		db: PrismaClient;
		redisStore: RedisStore;
		playerNotifier: PlayerNotifier;
		nowPlayingCardStore?: import('../modules/audio/lavalink/player/nowPlayingCard.ts').NowPlayingCardStore;
		playerStatePublishTracker?: Map<string, { at: number; fingerprint: string }>;
		guildService: GuildService;
		trackService: TrackService;
		playlistService: import('../services/playlistService.ts').PlaylistService;
		audioService: import('../services/audioService.ts').AudioService;
		mixerService: import('../services/mixerService.ts').MixerService;
		ttsService: import('../services/ttsService.ts').TtsService;
		ttsUserSettings: import('../services/ttsUserSettings.ts').TtsUserSettingsService;
		chatTtsService: import('../services/chatTts.ts').ChatTtsService;
		tempVoiceService: import('../services/tempVoiceService.ts').TempVoiceService;
		aiMemoryService: import('../services/aiMemoryService.ts').AiMemoryService;
		guildSettingsInvalidator: import('../services/guildSettingsInvalidator.ts').GuildSettingsInvalidator;
		playerWebResponder?: import('../services/playerWebResponder.ts').PlayerWebResponder;
		jtcSetupResponder?: import('../services/jtcSetupResponder.ts').JtcSetupResponder;
		botProfileService: import('../services/botProfileService.ts').BotProfileService;
		memberGreetingService: import('../services/memberGreetingService.ts').MemberGreetingService;
		guildDataResponder?: import('../services/guildDataResponder.ts').GuildDataResponder;
		socialWebhookResponder?: import('../services/socialWebhookResponder.ts').SocialWebhookResponder;
		appEmojiManager?: import('../services/appEmojiManager.ts').AppEmojiManager;
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
