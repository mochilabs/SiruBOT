import type { GiveawayCondition } from "@sirubot/utils/giveaway";

import { forwardDataApiPost } from "./client";

export type GiveawayManageInput =
  | {
      action: "start";
      channelId: string;
      prize: string;
      winnerCount: number;
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
