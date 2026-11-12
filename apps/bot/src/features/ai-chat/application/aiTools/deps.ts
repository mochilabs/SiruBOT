import type { PrismaClient } from '@sirubot/prisma';
import type { Client } from 'discord.js';
import type { LavalinkManager } from 'lavalink-client';
import type {
	AudioService,
	CustomPlayer,
	MixerService,
	MusicControl,
	MusicPlayService,
	PlaylistService,
	SponsorBlockService
} from '../../../music/index.ts';
import type { TempVoiceService } from '../../../temp-voice/index.ts';
import type { AiMemoryService } from '../aiMemoryService.ts';
import type { GuildService } from '../../../../services/guildService.ts';

/** bot_help가 읽는 슬래시 명령어 정보 — Sapphire Command의 일부라서 피스 클래스를 몰라도 되게 필요한 멤버만 둬요 */
export interface AiToolCommandInfo {
	name: string;
	description: string;
	fullCategory: readonly string[];
	options: { preconditions?: unknown };
}

/** web_search가 읽는 검색 설정 (SearXNG 우선, 꺼져 있으면 DuckDuckGo) */
export interface AiToolSearchConfig {
	searxngEnabled: boolean;
	searxngBaseUrl: string | undefined;
}

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
	/** 곡 검색·대기열 추가 유스케이스 (music_play) — setupServices 뒤에 생겨서 호출 시점에 읽어요 */
	getMusicPlay: () => MusicPlayService;
	/** setupAudio 뒤에 생겨요 — 아직 없으면 undefined */
	getAudio: () => LavalinkManager<CustomPlayer> | undefined;
	getClient: () => Client;
	/** 등록된 슬래시 명령어 피스 목록 (bot_help가 읽어요) */
	getCommands: () => Iterable<[string, AiToolCommandInfo]>;
	/** 웹 검색 설정 — 호출할 때마다 읽어요 */
	getSearchConfig: () => AiToolSearchConfig;
}
