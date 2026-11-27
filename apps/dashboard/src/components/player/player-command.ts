import type { PlayerWebControlAction } from "@sirubot/utils/playerWeb";

import { playerErrorMessage } from "@/lib/player-error";

export const CONTROL_BLOCKED_HINT =
  "봇과 같은 음성 채널에 있고, DJ 역할이 있거나 혼자 듣고 있을 때 제어할 수 있어요. 서버 관리자와 DJ 역할은 채널 밖에서도 제어할 수 있어요.";

export const VOICE_CONTEXT_REFRESH_MS = 15_000;

export interface PlayerCommandParams {
  value?: number;
  index?: number;
  from?: number;
  to?: number;
  positionMs?: number;
}

export async function sendPlayerCommand(
  guildId: string,
  action: PlayerWebControlAction,
  params?: number | PlayerCommandParams,
): Promise<{ ok: boolean; message?: string }> {
  const extra: PlayerCommandParams =
    typeof params === "number" ? { value: params } : (params ?? {});

  try {
    const res = await fetch(`/api/servers/${guildId}/player/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        ...(extra.value !== undefined ? { value: extra.value } : {}),
        ...(extra.index !== undefined ? { index: extra.index } : {}),
        ...(extra.from !== undefined ? { from: extra.from } : {}),
        ...(extra.to !== undefined ? { to: extra.to } : {}),
        ...(extra.positionMs !== undefined
          ? { positionMs: extra.positionMs }
          : {}),
      }),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    return {
      ok: false,
      message: playerErrorMessage(body?.error, "명령을 전달하지 못했어요."),
    };
  } catch {
    return {
      ok: false,
      message: "봇에 명령을 전달하지 못했어요. 연결 상태를 확인해 주세요.",
    };
  }
}
