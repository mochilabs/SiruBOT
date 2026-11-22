/**
 * 나눔 관리 — 봇에 위임하는 data-api 프록시 헬퍼예요.
 *
 * 참여 카드 게시와 결과 발표는 봇 토큰으로만 가능해요. 대시보드가 data-api `/v1/internal/giveaway/manage`를
 * 호출하면 data-api가 Redis request/reply로 봇에 전달해요. 서버 전용이에요 — API 라우트에서만 import해요.
 */
import type { GiveawayCondition } from "@sirubot/utils/giveaway";

import { forwardDataApiPost } from "./client";

export type GiveawayManageInput =
  | {
      action: "start";
      channelId: string;
      prize: string;
      winnerCount: number;
      /** ISO 8601 */
      endsAt: string;
      conditions: GiveawayCondition[];
    }
  | { action: "end" | "cancel"; giveawayId: string }
  | { action: "reroll"; giveawayId: string; count: number };

export interface GiveawayManageApiResult {
  ok: boolean;
  giveawayId: string | null;
  winnerIds: string[];
  error: string | null;
  status: number;
}

/** 시작은 카드 게시까지 기다리므로 넉넉히 18초 (data-api 봇 응답 대기 15초보다 길게) */
export async function requestGiveawayManage(
  guildId: string,
  userId: string,
  input: GiveawayManageInput,
): Promise<GiveawayManageApiResult> {
  const result = await forwardDataApiPost<{
    ok: true;
    giveawayId: string | null;
    winnerIds: string[];
  }>("/v1/internal/giveaway/manage", { guildId, userId, ...input }, { timeoutMs: 18_000 });
  if (!result.ok) {
    return { ok: false, giveawayId: null, winnerIds: [], error: result.message ?? null, status: result.status };
  }
  return { ok: true, giveawayId: result.data.giveawayId ?? null, winnerIds: result.data.winnerIds ?? [], error: null, status: 200 };
}
