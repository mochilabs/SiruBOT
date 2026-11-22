import { NextResponse } from "next/server";

import { createGuildApiHandler } from "@/lib/api-handler";
import { requestGiveawayManage } from "@/lib/data-api/giveaway";
import { listGiveaways, startGiveawaySchema } from "@/lib/giveaways";
import { READ_RATE, WRITE_RATE } from "@/lib/rate-limit";

/** 진행 중·지난 나눔 목록 (서버 관리 권한) */
export const GET = createGuildApiHandler({
  role: "manage",
  rate: READ_RATE,
  key: "giveaways-get",
  handler: async ({ guildId }) => {
    try {
      return NextResponse.json(await listGiveaways(guildId));
    } catch (error) {
      console.error("Failed to load giveaways:", error);
      return NextResponse.json({ error: "요청을 처리하지 못했어요." }, { status: 500 });
    }
  },
});

/**
 * 나눔 시작 — 참여 카드를 올리려면 봇 토큰이 필요해서 data-api → Redis로 봇에 위임해요.
 * 입력 규칙(상품·당첨자 수·마감·조건)은 슬래시 명령과 같은 계약(@sirubot/utils/giveaway)이고,
 * 서버당 진행 중 상한과 채널 권한은 봇이 확인해 한국어 사유로 돌려줘요.
 */
export const POST = createGuildApiHandler({
  role: "manage",
  rate: WRITE_RATE,
  key: "giveaways-post",
  schema: startGiveawaySchema,
  handler: async ({ guildId, authz, data }) => {
    try {
      const result = await requestGiveawayManage(guildId, authz.userId, {
        action: "start",
        channelId: data.channelId,
        prize: data.prize,
        winnerCount: data.winnerCount,
        endsAt: data.endsAt.toISOString(),
        conditions: data.conditions,
      });
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error ?? "나눔을 시작하지 못했어요." },
          { status: result.status >= 400 ? result.status : 502 },
        );
      }
      return NextResponse.json({ ok: true, giveawayId: result.giveawayId }, { status: 201 });
    } catch (error) {
      console.error("Failed to start giveaway:", error);
      return NextResponse.json({ error: "요청을 처리하지 못했어요." }, { status: 500 });
    }
  },
});
