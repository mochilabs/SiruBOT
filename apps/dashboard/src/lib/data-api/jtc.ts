import { forwardDataApiPost } from "./client";
import type { JtcSetupApiResult } from "./types";

export async function requestJtcSetup(
  guildId: string,
  userId: string,
  categoryId: string,
  markerChannelName?: string,
): Promise<JtcSetupApiResult> {
  const result = await forwardDataApiPost<{
    ok: true;
    markerChannelId: string | null;
  }>("/v1/internal/jtc/setup", {
    guildId,
    userId,
    categoryId,
    ...(markerChannelName ? { markerChannelName } : {}),
  });
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
