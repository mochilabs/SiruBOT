import type { PlayerWebControlAction } from "@sirubot/utils/playerWeb";

import { forwardDataApiGet, forwardDataApiPost } from "./client";
import type { PlayerVoiceContextData, PlayerWebApiResult, PlayerWebTrackSummary } from "./types";

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
      ...(result.code ? { code: result.code } : {}),
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

export function requestPlayerPlay(
  guildId: string,
  userId: string,
  uri: string,
): Promise<PlayerWebApiResult> {
  return requestPlayerWeb("/v1/internal/player/play", { guildId, userId, uri });
}

export interface PlayerControlParams {
  value?: number;
  index?: number;
  from?: number;
  to?: number;
  positionMs?: number;
}

export function requestPlayerControl(
  guildId: string,
  userId: string,
  action: PlayerWebControlAction,
  params?: number | PlayerControlParams,
): Promise<PlayerWebApiResult> {
  const extra: PlayerControlParams =
    typeof params === "number" ? { value: params } : (params ?? {});
  return requestPlayerWeb("/v1/internal/player/control", {
    guildId,
    userId,
    action,
    ...(extra.value !== undefined ? { value: extra.value } : {}),
    ...(extra.index !== undefined ? { index: extra.index } : {}),
    ...(extra.from !== undefined ? { from: extra.from } : {}),
    ...(extra.to !== undefined ? { to: extra.to } : {}),
    ...(extra.positionMs !== undefined ? { positionMs: extra.positionMs } : {}),
  });
}

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
