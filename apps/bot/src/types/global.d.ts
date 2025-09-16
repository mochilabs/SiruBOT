import { ArrayString } from '@skyra/env-utilities';
import { PrismaClient } from '@sirubot/prisma';
import { LavalinkManager } from 'lavalink-client';
import { RedisStoreManager } from '../modules/audio/lavalink/redisStoreManager.ts';
import { GuildService } from '../services/guildService.ts';

declare module '@skyra/env-utilities' {
	interface Env {
		OWNERS: ArrayString;
		LAVALINK_HOSTS: ArrayString;
		DISCORD_TOKEN: string;
		REDIS_URL: string;
		LOGLEVEL: number;
		BOT_ACTIVITY: string;
	}
}

declare module '@sapphire/pieces' {
	interface Container {
		audio: LavalinkManager;
		db: PrismaClient;
		redisStoreManager: RedisStoreManager;
		guildService: GuildService;
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
