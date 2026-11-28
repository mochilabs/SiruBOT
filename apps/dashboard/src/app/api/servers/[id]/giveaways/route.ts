import { NextResponse } from "next/server";

import { createGuildApiHandler } from "@/lib/api-handler";
import { requestGiveawayManage } from "@/lib/data-api/giveaway";
import { listGiveaways, startGiveawaySchema } from "@/lib/giveaways";
import { READ_RATE, WRITE_RATE } from "@/lib/rate-limit";

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
