interface DataApiPlaybackCounts {
  track_start: number;
  track_end: number;
  track_stuck: number;
  track_error: number;
  queue_end: number;
  playback_abort: number;
  node_disconnect: number;
  node_error: number;
}

interface DataApiPlaybackError {
  type: string;
  guildId: string | null;
  nodeId: string | null;
  shardId: number | null;
  trackTitle: string | null;
  trackAuthor: string | null;
  reason: string | null;
  consecutiveErrors: number;
  count: number;
  at: number;
}

export interface DataApiStatus {
  ok: boolean;
  redis: boolean;
  cache: { redisHits: number; memoryHits: number; misses: number };
  routes: Record<
    string,
    {
      requests: number;
      cacheHits: number;
      upstreamCalls: number;
      upstreamErrors: number;
    }
  >;
  playback: {
    counts: DataApiPlaybackCounts;
    recentErrors: DataApiPlaybackError[];
  };
}

export interface GuildSettingsInvalidateResult {
  ok: boolean;
}

export interface DataApiForwardOk<T> {
  ok: true;
  data: T;
}

export interface DataApiForwardFail {
  ok: false;
  status: number;
  message: string | null;
  code?: string;
}

export type DataApiForwardResult<T> = DataApiForwardOk<T> | DataApiForwardFail;

export type DataApiImageResult =
  | { ok: true; buffer: ArrayBuffer; contentType: string }
  | DataApiForwardFail;

export interface PlayerWebTrackSummary {
  title: string;
  author: string;
  durationMs: number;
  artworkUrl: string | null;
  uri: string;
  sourceName: string | null;
  isStream: boolean;
}

export interface PlayerVoiceContextData {
  inVoice: boolean;
  voiceChannelName: string | null;
  botVoiceChannelName?: string | null;
  canControl: boolean;
  canPlay: boolean;
}

export interface PlayerWebApiResult {
  ok: boolean;
  tracks: PlayerWebTrackSummary[] | null;
  voice: PlayerVoiceContextData | null;
  error: string | null;
  code?: string;
  status: number;
}

export interface GuildMemberSummary {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
}

export interface JtcSetupApiResult {
  ok: boolean;
  markerChannelId: string | null;
  error: string | null;
  status: number;
}
