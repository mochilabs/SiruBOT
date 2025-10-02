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
		OWNERS: ArrayString;
		LAVALINK_HOSTS: ArrayString;
		DISCORD_TOKEN: string;
		REDIS_URL: string;
		LOGLEVEL: number;
		REGISTER_COMMANDS?: unknown;
		BOT_ACTIVITY: string;
		DEV_GUILD_IDS: ArrayString;
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
	}
}

declare module '@sapphire/framework' {
	interface Preconditions {
		OwnerOnly: never;

		VoiceConnected: never;
		SameVoiceChannel: never;
		NodeAvailable: never;
		SongPlaying: never;

		MemberListenable: never;
		ClientVoiceConnectable: never;
		ClientVoiceSpeakable: never;

		DJRole: never;
	}
}
