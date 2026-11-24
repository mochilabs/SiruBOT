import type { PlayerWebControlAction } from "@sirubot/utils/playerWeb";

import { playerErrorMessage } from "@/lib/player-error";

/** 제어 버튼이 비활성화된 이유 — 봇의 음악 제어 정책을 그대로 풀어 쓴 안내예요 */
export const CONTROL_BLOCKED_HINT =
  "봇과 같은 음성 채널에 있고, DJ 역할이 있거나 혼자 듣고 있을 때 제어할 수 있어요. 서버 관리자와 DJ 역할은 채널 밖에서도 제어할 수 있어요.";

/** 제어 가능 여부 재검증 주기 — 음성 채널 입·퇴장은 서버가 밀어주지 않아 주기적으로 다시 물어봐요 */
export const VOICE_CONTEXT_REFRESH_MS = 15_000;

export interface PlayerCommandParams {
  value?: number;
  index?: number;
  from?: number;
  to?: number;
  positionMs?: number;
}

/** 봇 검증 실패 시 안내 문구도 전달해요 — "명령 실패" 대신 실제 이유를 토스트로 보여줘요 */
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
