import { SapphireClient } from '@sapphire/framework';
import { PrismaClient } from '@sirubot/prisma';
import { ArrayString } from '@skyra/env-utilities';
import { LavalinkManager } from 'lavalink-client';
import { BotApplication } from '../core/botApplication.ts';
import { RedisStoreManager } from '../modules/audio/lavalink/redisStoreManager.ts';
import { SapphireInterfaceLogger } from '../core/logger.ts';

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

declare module '@sapphire/framework' {
	interface Container {
		logger: SapphireInterfaceLogger;
		audio: LavalinkManager;
		db: PrismaClient;
		redisStoreManager: RedisStoreManager;
	}

	interface Preconditions {
		OwnerOnly: never;

		VoiceConnected: never;
		SameVoiceChannel: never;
		NodeAvailable: never;
		SongPlaying: never;

		MemberListenable: never;
		ClientVoiceConnectable: never;
		ClientVoiceSpeakable: never;
	}
}
