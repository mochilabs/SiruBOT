/**
 * 임시 방(JTC) 마커 채널 셋업 — 채널 생성·이동을 봇에 위임해요.
 */
import { forwardDataApiPost } from "./client";
import type { JtcSetupApiResult } from "./types";

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
