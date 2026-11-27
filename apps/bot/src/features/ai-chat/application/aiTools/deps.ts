import type { PrismaClient } from '@sirubot/prisma';
import type { ApplicationCommand, Client } from 'discord.js';
import type { LavalinkManager } from 'lavalink-client';
import type {
	AudioService,
	CustomPlayer,
	MixerService,
	MusicControl,
	MusicPlayService,
	MusicToolPort,
	PlaylistService,
	SponsorBlockService
} from '../../../music/index.ts';
import type { TempVoiceService } from '../../../temp-voice/index.ts';
import type { AiMemoryService } from '../aiMemoryService.ts';
import type { GuildService } from '../../../../services/guildService.ts';

export interface AiToolCommandInfo {
	name: string;
	description: string;
	fullCategory: readonly string[];
	options: { preconditions?: unknown };
}

export interface AiToolSearchConfig {
	searxngEnabled: boolean;
	searxngBaseUrl: string | undefined;
}

/** music·audio·client·명령어 스토어는 setupServices 이후 채워져 호출 시점에 읽어요. */
export interface AiToolDeps {
	db: PrismaClient;
	guildService: GuildService;
	aiMemory: AiMemoryService;
	audioService: AudioService;
	mixerService: MixerService;
	sponsorBlock: Pick<SponsorBlockService, 'refreshSettings'>;
	musicPort: MusicToolPort;
	playlistService: PlaylistService;
	tempVoice: Pick<TempVoiceService, 'setupMarkerChannel'>;
	getMusic: () => MusicControl;
	getMusicPlay: () => MusicPlayService;
	getAudio: () => LavalinkManager<CustomPlayer> | undefined;
	getClient: () => Client;
	getCommands: () => Iterable<[string, AiToolCommandInfo]>;
	fetchCommandIndex: (guildId: string | null) => Promise<ReadonlyMap<string, ApplicationCommand>>;
	getSearchConfig: () => AiToolSearchConfig;
	syncTextChannelPanel?: (guildId: string, previousChannelId: string | null) => Promise<void>;
}
