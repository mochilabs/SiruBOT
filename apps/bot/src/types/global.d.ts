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

declare module '@skyra/env-utilities' {
	interface Env {
		DISCORD_TOKEN: string;
		OWNERS: ArrayString;
		LAVALINK_HOSTS: string;
		BOT_ACTIVITY: string;
		LOGLEVEL: string;
		REDIS_URL: string;
		DATABASE_URL: string;
		DEV_GUILD_IDS: ArrayString;
		REGISTER_COMMANDS?: string;
		SHARD_MANAGER_URL?: string;
		AUTH_KEY?: string;
	}
}

declare module '@sapphire/pieces' {
	interface Container {
		audio: LavalinkManager<CustomPlayer>;
		lavalinkHandler: LavalinkHandler;
		db: PrismaClient;
		redisStore: RedisStore;
		playerNotifier: PlayerNotifier;
		guildService: GuildService;
		trackService: TrackService;
		shardClient?: import('@sirubot/shardclient').ShardClient;
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
