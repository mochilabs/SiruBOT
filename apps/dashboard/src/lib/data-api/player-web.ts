/**
 * 웹 플레이어 request/reply — 검색·재생·라이브 제어·음성 컨텍스트를 봇에 위임해요.
 */
import { forwardDataApiGet, forwardDataApiPost } from "./client";
import type { PlayerVoiceContextData, PlayerWebApiResult, PlayerWebTrackSummary } from "./types";

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
