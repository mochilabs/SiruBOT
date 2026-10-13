interface DataApiPlaybackCounts {
  track_start: number;
  track_end: number;
  track_stuck: number;
  track_error: number;
  queue_end: number;
  playback_abort: number;
}

interface DataApiPlaybackError {
  type: string;
  guildId: string;
  shardId: number | null;
  trackTitle: string | null;
  trackAuthor: string | null;
  reason: string | null;
  consecutiveErrors: number;
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

const DATA_API_URL = process.env.DATA_API_URL || "http://localhost:3002";
const DATA_API_AUTH_KEY =
  process.env.DATA_API_AUTH_KEY || process.env.AUTH_KEY || "";

/**
 * data-api GET 프록시 — AUTH_KEY는 서버 전용(env). 클라이언트 번들로 절대 노출하지 않아요.
 * 키가 없으면(또는 공백뿐이면) 실패시키지 않고 null — 무인증 localhost 호출을 안 한다.
 */
export async function fetchDataApi<T>(path: string): Promise<T | null> {
  const authKey = DATA_API_AUTH_KEY.trim();
  if (!authKey) {
    console.warn(
      "[data-api] DATA_API_AUTH_KEY/AUTH_KEY 미설정 — data-api 호출을 건너뛴다.",
    );
    return null;
  }

  try {
    const res = await fetch(`${DATA_API_URL}${path}`, {
      cache: "no-store",
      headers: { Authorization: authKey },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * data-api SSE 스트림 프록시 — 인증 헤더를 붙여 upstream Response를 그대로 돌려준다.
 * 미설정이면 null (라우트에서 502 응답으로 변환).
 * SSE는 장기 연결이라 여기엔 AbortSignal.timeout을 걸지 않는다 — 타임아웃이 연결 전체를 잘라버리기 때문.
 */
export async function openDataApiStream(
  path: string,
): Promise<Response | null> {
  const authKey = DATA_API_AUTH_KEY.trim();
  if (!authKey) return null;

  try {
    const upstream = await fetch(`${DATA_API_URL}${path}`, {
      headers: { Authorization: authKey },
      cache: "no-store",
    });
    if (!upstream.ok || !upstream.body) return null;
    return upstream;
  } catch {
    return null;
  }
}

/**
 * data-api POST 프록시 (JSON) — AUTH_KEY는 서버 전용(env). 클라이언트 번들로 절대 노출하지 않아요.
 * 키가 없으면 실패시키지 않고 null. 네트워크/HTTP 오류도 null — 호출자가 실패 내성을 결정해요.
 */
export async function postDataApi<T>(
  path: string,
  body: unknown,
): Promise<T | null> {
  const authKey = DATA_API_AUTH_KEY.trim();
  if (!authKey) return null;

  try {
    const res = await fetch(`${DATA_API_URL}${path}`, {
      method: "POST",
      cache: "no-store",
      headers: { Authorization: authKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
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

/**
 * data-api POST 프록시(JSON) — postDataApi와 달리 실패 상태와 본문 message를 파기하지 않아요.
 * 인사 카드 이미지 라우트처럼 data-api의 형식·용량 안내(400)를 사용자에게 그대로 보여줘야 하는 곳에서 써요.
 */
export async function forwardDataApiPost<T>(
  path: string,
  body: unknown,
): Promise<DataApiForwardResult<T>> {
  const authKey = DATA_API_AUTH_KEY.trim();
  if (!authKey) {
    console.warn(
      "[data-api] DATA_API_AUTH_KEY/AUTH_KEY 미설정 — data-api 호출을 건너뛴다.",
    );
    return { ok: false, status: 503, message: null };
  }
  try {
    const res = await fetch(`${DATA_API_URL}${path}`, {
      method: "POST",
      cache: "no-store",
      headers: { Authorization: authKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as {
        message?: unknown;
      } | null;
      return {
        ok: false,
        status: res.status,
        message:
          typeof payload?.message === "string" && payload.message.trim()
            ? payload.message
            : null,
      };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: 502, message: null };
  }
}

/**
 * data-api GET 프록시 — forwardDataApiPost와 동일한 계약으로 실패 상태와 본문 message(한국어)를 파기하지 않아요.
 * 채널·역할 목록처럼 data-api의 실패 안내(502 봇 무응답·503 Redis 장애)를 사용자에게 그대로 보여줘야 하는 곳에서 써요.
 */
export async function forwardDataApiGet<T>(
  path: string,
): Promise<DataApiForwardResult<T>> {
  const authKey = DATA_API_AUTH_KEY.trim();
  if (!authKey) {
    console.warn(
      "[data-api] DATA_API_AUTH_KEY/AUTH_KEY 미설정 — data-api 호출을 건너뛴다.",
    );
    return { ok: false, status: 503, message: null };
  }
  try {
    const res = await fetch(`${DATA_API_URL}${path}`, {
      cache: "no-store",
      headers: { Authorization: authKey },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as {
        message?: unknown;
      } | null;
      return {
        ok: false,
        status: res.status,
        message:
          typeof payload?.message === "string" && payload.message.trim()
            ? payload.message
            : null,
      };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: 502, message: null };
  }
}

export type DataApiImageResult =
  | { ok: true; buffer: ArrayBuffer; contentType: string }
  | DataApiForwardFail;

/**
 * data-api POST 프록시(이미지) — PNG 등 binary 본문을 ArrayBuffer로 돌려줘요.
 * 응답이 image/*가 아니면 실패로 본다.
 */
export async function forwardDataApiImage(
  path: string,
  body: unknown,
): Promise<DataApiImageResult> {
  const authKey = DATA_API_AUTH_KEY.trim();
  if (!authKey) {
    console.warn(
      "[data-api] DATA_API_AUTH_KEY/AUTH_KEY 미설정 — data-api 호출을 건너뛴다.",
    );
    return { ok: false, status: 503, message: null };
  }
  try {
    // 이미지 렌더는 data-api에서 최대 ~20초까지 걸릴 수 있어요 (봇 dataApiClient 기준) — 여유 있게 30초.
    const res = await fetch(`${DATA_API_URL}${path}`, {
      method: "POST",
      cache: "no-store",
      headers: { Authorization: authKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as {
        message?: unknown;
      } | null;
      return {
        ok: false,
        status: res.status,
        message:
          typeof payload?.message === "string" && payload.message.trim()
            ? payload.message
            : null,
      };
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/"))
      return { ok: false, status: 502, message: null };
    return { ok: true, buffer: await res.arrayBuffer(), contentType };
  } catch {
    return { ok: false, status: 502, message: null };
  }
}

/**
 * 길드 설정 변경을 모든 봇 프로세스에 브로드캐스트 — 대시보드 PUT 성공 직후 호출해요.
 * data-api가 Redis 채널로 publish하고 각 봇이 자기 GuildService 캐시를 비워요.
 * 실패(null)여도 봇은 60초 TTL 폴백으로 결국 최신 설정을 읽으니 조용히 넘어가요.
 *
 * `reason: "mixer"` — 믹서(갭리스·크로스페이드) 저장이면 봇이 재생 중인 플레이어에
 * 설정을 바로 밀어 넣어요 (다음 곡까지 기다리지 않아요).
 */
export async function notifyGuildSettingsChanged(
  guildId: string,
  reason?: "mixer",
): Promise<boolean> {
  const result = await postDataApi<GuildSettingsInvalidateResult>(
    "/v1/internal/guild-settings/invalidate",
    reason ? { guildId, reason } : { guildId },
  );
  return result?.ok === true;
}

/** 라이브 탭 컨트롤러 볼륨 상한 — 봇 /volume 명령 계약(0~150)과 같아요 */
export const PLAYER_VOLUME_MAX = 150;

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

/**
 * 웹 플레이어 request/reply — 요청자(userId)를 봇에 전달해 음성 채널·권한을 봇이 판정해요.
 * forwardDataApiPost 계약 위에서 실패 상태와 한국어 message를 그대로 보존해요.
 */
async function requestPlayerWeb(
  path: string,
  body: unknown,
): Promise<PlayerWebApiResult> {
  const result = await forwardDataApiPost<{
    ok: true;
    tracks: PlayerWebTrackSummary[] | null;
    voice: PlayerVoiceContextData | null;
  }>(path, body);
  if (!result.ok) {
    return {
      ok: false,
      tracks: null,
      voice: null,
      error: result.message ?? null,
      status: result.status,
    };
  }
  return {
    ok: true,
    tracks: result.data.tracks ?? null,
    voice: result.data.voice ?? null,
    error: null,
    status: 200,
  };
}

/** 곡 검색 — 검증(권한·음성 접속)까지 봇에서 수행돼요. 실패 시 error에 안내가 실려요 */
export function requestPlayerSearch(
  guildId: string,
  userId: string,
  query: string,
): Promise<PlayerWebApiResult> {
  return requestPlayerWeb("/v1/internal/player/search", {
    guildId,
    userId,
    query,
  });
}

/** 재생 시작 — 검색 결과의 uri(또는 플레이리스트·다시 재생 URL)를 봇이 검색해 큐잉·접속·재생해요 */
export function requestPlayerPlay(
  guildId: string,
  userId: string,
  uri: string,
): Promise<PlayerWebApiResult> {
  return requestPlayerWeb("/v1/internal/player/play", { guildId, userId, uri });
}

/** 라이브 제어 — volume·pause·resume·skip·stop (볼륨은 value 필수) */
export function requestPlayerControl(
  guildId: string,
  userId: string,
  action: "volume" | "pause" | "resume" | "skip" | "stop" | "repeat",
  value?: number,
): Promise<PlayerWebApiResult> {
  return requestPlayerWeb("/v1/internal/player/control", {
    guildId,
    userId,
    action,
    ...(value !== undefined ? { value } : {}),
  });
}

/** 요청자 음성·권한 상태 조회 — player 페이지 배지와 재생 UI 활성화에 써요 */
export async function fetchPlayerVoiceContext(
  guildId: string,
  userId: string,
): Promise<PlayerWebApiResult> {
  const result = await forwardDataApiGet<{
    ok: true;
    voice: PlayerVoiceContextData | null;
  }>(
    `/v1/player/${guildId}/voice-context?userId=${encodeURIComponent(userId)}`,
  );
  if (!result.ok) {
    return {
      ok: false,
      tracks: null,
      voice: null,
      error: result.message ?? null,
      status: result.status,
    };
  }
  return {
    ok: true,
    tracks: null,
    voice: result.data.voice ?? null,
    error: null,
    status: 200,
  };
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

/**
 * JTC 마커 채널 셋업을 봇에 위임해요 — 채널 생성·이동은 Discord 규격상 봇 토큰으로만 가능하고,
 * 유저 OAuth 토큰으로는 403이 나요. 검증 실패 시 error에 안내가 실려요.
 */
export async function requestJtcSetup(
  guildId: string,
  userId: string,
  categoryId: string,
): Promise<JtcSetupApiResult> {
  const result = await forwardDataApiPost<{
    ok: true;
    markerChannelId: string | null;
  }>("/v1/internal/jtc/setup", { guildId, userId, categoryId });
  if (!result.ok) {
    return {
      ok: false,
      markerChannelId: null,
      error: result.message ?? null,
      status: result.status,
    };
  }
  return {
    ok: true,
    markerChannelId: result.data.markerChannelId ?? null,
    error: null,
    status: 200,
  };
}

/**
 * data-api 상태 조회 — 관제 페이지(/api/data-api)용. 폴백 체인(DATA_API_AUTH_KEY || AUTH_KEY)은
 * 기존 방침을 유지한다. 키가 없으면(또는 공백뿐이면) 실패시키지 않고 경고 후 스킵.
 */
export async function fetchDataApiStatus(): Promise<DataApiStatus | null> {
  // 폴백 체인(DATA_API_AUTH_KEY || AUTH_KEY)은 기존 방침을 유지한다.
  // 키가 없으면(또는 공백뿐이면) 실패시키지 않고 경고 후 스킵 — 무인증 localhost 호출을 안 한다.
  const authKey = DATA_API_AUTH_KEY.trim();
  if (!authKey) {
    console.warn(
      "[data-api] DATA_API_AUTH_KEY/AUTH_KEY 미설정 — 무인증 호출 대신 status 조회를 건너뛴다.",
    );
    return null;
  }

  try {
    const res = await fetch(`${DATA_API_URL}/v1/status`, {
      cache: "no-store",
      headers: { Authorization: authKey },
    });
    if (!res.ok) return null;
    return (await res.json()) as DataApiStatus;
  } catch {
    return null;
  }
}
