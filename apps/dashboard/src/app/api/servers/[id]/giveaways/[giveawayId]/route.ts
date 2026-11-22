import { NextResponse } from "next/server";
import { giveawayWinnerCountSchema } from "@sirubot/utils/giveaway";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { requestGiveawayManage } from "@/lib/data-api/giveaway";
import { WRITE_RATE } from "@/lib/rate-limit";

// 공용 핸들러는 객체 스키마만 받아서, 다시 뽑기의 인원은 superRefine으로 요구해요
const actionSchema = z
  .object({ action: z.enum(["end", "cancel", "reroll"]), count: giveawayWinnerCountSchema.optional() })
  .superRefine((value, ctx) => {
    if (value.action === "reroll" && value.count === undefined) {
      ctx.addIssue({ code: "custom", path: ["count"], message: "다시 뽑을 인원을 입력해 주세요." });
    }
  });

/**
 * 나눔 종료(지금 추첨)·취소·다시 뽑기 — 결과 발표는 봇 토큰이 필요해서 data-api → Redis로 봇에 위임해요.
 * 나눔이 이 서버 것인지와 상태(진행 중·종료)는 봇이 확인해 한국어 사유로 돌려줘요.
 */
export const POST = createGuildApiHandler({
  role: "manage",
  rate: WRITE_RATE,
  key: "giveaways-action",
  schema: actionSchema,
  handler: async ({ guildId, authz, params, data }) => {
    try {
      const giveawayId = params.giveawayId;
      if (!giveawayId || giveawayId.length > 64) {
        return NextResponse.json({ error: "나눔 ID가 올바르지 않아요." }, { status: 400 });
      }
      const result = await requestGiveawayManage(
        guildId,
        authz.userId,
        data.action === "reroll"
          ? { action: "reroll", giveawayId, count: data.count ?? 1 }
          : { action: data.action, giveawayId },
      );
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error ?? "나눔 요청을 처리하지 못했어요." },
          { status: result.status >= 400 ? result.status : 502 },
        );
      }
      return NextResponse.json({ ok: true, winnerIds: result.winnerIds });
    } catch (error) {
      console.error("Failed to manage giveaway:", error);
      return NextResponse.json({ error: "요청을 처리하지 못했어요." }, { status: 500 });
    }
  },
});
