/**
 * data-api 응답/요청 계약 타입 — 서버·클라이언트 어디서든 import해도 번들에 env가 새지 않는 순수 타입 모듈이에요.
 */
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

/** 길드 설정 캐시 무효화 브로드캐스트 결과 */
export interface GuildSettingsInvalidateResult {
  ok: boolean;
}

/** data-api 호출 결과의 성공 형태 — JSON 응답이에요 */
export interface DataApiForwardOk<T> {
  ok: true;
  data: T;
}

/** data-api 호출 실패 — status와 4xx 본문의 message(한국어)를 그대로 전달해요 */
export interface DataApiForwardFail {
  ok: false;
  status: number;
  message: string | null;
}

export type DataApiForwardResult<T> = DataApiForwardOk<T> | DataApiForwardFail;

export type DataApiImageResult =
  | { ok: true; buffer: ArrayBuffer; contentType: string }
  | DataApiForwardFail;

/** 웹 플레이어 검색 결과 요약 — 봇이 Lavalink 검색 결과에서 추출해 내려줘요 */
export interface PlayerWebTrackSummary {
  title: string;
  author: string;
  durationMs: number;
  artworkUrl: string | null;
  uri: string;
  sourceName: string | null;
  isStream: boolean;
}

/** 요청자 음성·권한 상태 — 봇이 음성 채널·DJ 권한을 해석해서 내려줘요 */
export interface PlayerVoiceContextData {
  inVoice: boolean;
  voiceChannelName: string | null;
  canControl: boolean;
}

export interface PlayerWebApiResult {
  ok: boolean;
  /** 검색 결과 — search 성공 시에만 있어요 */
  tracks: PlayerWebTrackSummary[] | null;
  /** 요청자 음성·권한 상태 — voice-context 성공 시에만 있어요 */
  voice: PlayerVoiceContextData | null;
  /** 실패 사유 — 봇이 실은 한국어 안내를 그대로 전달해요 */
  error: string | null;
  /** data-api 실패 상태 코드 — 라우트가 이 상태로 응답해요 */
  status: number;
}

/** 길드 멤버 표시 정보 — data-api가 봇 캐시에서 조회한 별명·사용자명·아바타예요 */
export interface GuildMemberSummary {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
}

/** 임시 방(JTC) 마커 채널 셋업 결과 — 봇 tempVoiceService가 수행한 결과예요 */
export interface JtcSetupApiResult {
  ok: boolean;
  /** 마커 채널 ID — 성공 시에만 있어요 */
  markerChannelId: string | null;
  /** 실패 사유 — 봇이 실은 한국어 안내를 그대로 전달해요 */
  error: string | null;
  /** data-api 실패 상태 코드 — 라우트가 이 상태로 응답해요 */
  status: number;
}
