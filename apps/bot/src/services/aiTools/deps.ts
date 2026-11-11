import type { Command } from '@sapphire/framework';
import type { PrismaClient } from '@sirubot/prisma';
import type { Client } from 'discord.js';
import type { LavalinkManager } from 'lavalink-client';
import type { MusicControl } from '../../features/music/application/control.ts';
import type { TempVoiceService } from '../../features/temp-voice/index.ts';
import type { CustomPlayer } from '../../modules/audio/lavalink/player/customPlayer.ts';
import type { AiMemoryService } from '../aiMemoryService.ts';
import type { AudioService } from '../audioService.ts';
import type { GuildService } from '../guildService.ts';
import type { MixerService } from '../mixerService.ts';
import type { PlaylistService } from '../playlistService.ts';
import type { SponsorBlockService } from '../sponsorBlockService.ts';

/**
 * AI 도구가 쓰는 의존성 — BotApplication.setupServices가 한 번 엮어 createAiTools(deps)에 넘겨요.
 * 도구는 진입점 어댑터라 container를 읽지 않고 여기서 받은 것만 써요.
 * 음악 제어(music)·플레이어 매니저(audio)·client·명령어 스토어는 setupServices 뒤에 채워져서 호출 시점에 읽어요.
 */
export interface AiToolDeps {
	db: PrismaClient;
	guildService: GuildService;
	aiMemory: AiMemoryService;
	audioService: AudioService;
	mixerService: MixerService;
	sponsorBlock: Pick<SponsorBlockService, 'refreshSettings'>;
	playlistService: PlaylistService;
	tempVoice: Pick<TempVoiceService, 'setupMarkerChannel'>;
	getMusic: () => MusicControl;
	/** setupAudio 뒤에 생겨요 — 아직 없으면 undefined */
	getAudio: () => LavalinkManager<CustomPlayer> | undefined;
	getClient: () => Client;
	/** 등록된 슬래시 명령어 피스 목록 (bot_help가 읽어요) */
	getCommands: () => Iterable<[string, Command]>;
}
