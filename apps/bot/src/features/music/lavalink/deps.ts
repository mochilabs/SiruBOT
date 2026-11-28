import type { Client } from 'discord.js';
import type { LavalinkManager, Track } from 'lavalink-client';
import type { ILogObj, Logger } from 'tslog';
import type { AppLogger } from '../../../lib/appLogger.ts';
import type { GuildService } from '../../../services/guildService.ts';
import type { DataApiClient } from '../../../services/dataApiClient.ts';
import type { IncidentNoticeService } from '../../../services/incidentNotice.ts';
import type { ChatTtsService } from '../../tts/index.ts';
import type { TrackService } from '../application/trackService.ts';
import type { MixerService } from '../application/mixerService.ts';
import type { SponsorBlockService } from '../application/sponsorBlockService.ts';
import type { PlaybackReporter } from '../application/playbackReporter.ts';
import type { CustomPlayer } from './player/customPlayer.ts';
import type { PlayerNotifier } from './player/playerNotifier.ts';
import type { NowPlayingCardStore } from './player/nowPlayingCard.ts';
import type { RedisStore } from './redisStore.ts';

export interface LavalinkLogger extends AppLogger {
	getSubLogger(settings: { name: string }): Logger<ILogObj>;
}

export interface LavalinkShardInfo {
	shardIds: number[];
	shardCount: number;
}

export type PlayerStatePublishTracker = Map<
	string,
	{
		at: number;
		fingerprint: string;
		positionMs: number;
		advancing: boolean;
	}
>;

export interface LavalinkDeps {
	readonly logger: LavalinkLogger;
	readonly guildService: GuildService;
	readonly trackService: TrackService;
	readonly dataApi: DataApiClient;
	readonly chatTtsService: ChatTtsService;
	readonly playbackReporter: PlaybackReporter;
	readonly incidentNotice: IncidentNoticeService;
	readonly sponsorBlockService: SponsorBlockService;
	readonly mixerService: MixerService;
	readonly playerNotifier: PlayerNotifier;
	readonly audio: LavalinkManager<CustomPlayer>;
	readonly client: Client;
	readonly redisStore: RedisStore;
	readonly shardInfo: LavalinkShardInfo | undefined;
	readonly nowPlayingCards: NowPlayingCardStore;
	readonly playerStatePublishTracker: PlayerStatePublishTracker;
	readonly relatedFetchInFlight: Map<string, Promise<Track | null>>;
}
