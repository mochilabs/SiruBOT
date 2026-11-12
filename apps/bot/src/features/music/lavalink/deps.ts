/**
 * Lavalink 계층(핸들러·플레이어 알림·Redis 저장소)과 그 헬퍼가 쓰는 의존성 묶음이에요.
 *
 * 이 파일의 타입을 쓰는 모듈은 `container`를 읽지 않아요. 값은 `BotApplication.setupServices`가 `container.lavalink`로
 * 한 번 만들어 넘기고, 부팅 순서상 나중에 생기는 것(audio, client, redisStore, playerNotifier, shardInfo)은
 * getter로 호출 시점에 읽어요. 서로 얽힌 application 서비스(mixer, sponsorBlock)도 같은 방식이에요.
 */
import type { Client } from 'discord.js';
import type { LavalinkManager } from 'lavalink-client';
import type { ILogObj, Logger } from 'tslog';
import type { AppLogger } from '../../../lib/appLogger.ts';
import type { GuildService } from '../../../services/guildService.ts';
import type { DataApiClient } from '../../../services/dataApiClient.ts';
import type { ChatTtsService } from '../../tts/index.ts';
import type { TrackService } from '../application/trackService.ts';
import type { MixerService } from '../application/mixerService.ts';
import type { SponsorBlockService } from '../application/sponsorBlockService.ts';
import type { PlaybackReporter } from '../application/playbackReporter.ts';
import type { CustomPlayer } from './player/customPlayer.ts';
import type { PlayerNotifier } from './player/playerNotifier.ts';
import type { NowPlayingCardStore } from './player/nowPlayingCard.ts';
import type { RedisStore } from './redisStore.ts';

/** 하위 로거를 만드는 Sapphire 로거 — 핸들러 이름별 sub-logger(tslog)를 만들 때 써요. */
export interface LavalinkLogger extends AppLogger {
	getSubLogger(settings: { name: string }): Logger<ILogObj>;
}

/** 샤드 배정 정보 (setupAudio가 기록하고, 세션 복원이 읽어요). */
export interface LavalinkShardInfo {
	shardIds: number[];
	shardCount: number;
}

/** 길드별 마지막 플레이어 상태 퍼블리시 기록 (주기 스로틀 + 변경 지문). */
export type PlayerStatePublishTracker = Map<string, { at: number; fingerprint: string }>;

export interface LavalinkDeps {
	readonly logger: LavalinkLogger;
	readonly guildService: GuildService;
	readonly trackService: TrackService;
	readonly dataApi: DataApiClient;
	readonly chatTtsService: ChatTtsService;
	readonly playbackReporter: PlaybackReporter;
	readonly sponsorBlockService: SponsorBlockService;
	readonly mixerService: MixerService;
	readonly playerNotifier: PlayerNotifier;
	readonly audio: LavalinkManager<CustomPlayer>;
	readonly client: Client;
	readonly redisStore: RedisStore;
	readonly shardInfo: LavalinkShardInfo | undefined;
	/** now-playing 카드 캐시 소유자 — 버튼과 알림이 같은 상태를 써요. */
	readonly nowPlayingCards: NowPlayingCardStore;
	readonly playerStatePublishTracker: PlayerStatePublishTracker;
}
