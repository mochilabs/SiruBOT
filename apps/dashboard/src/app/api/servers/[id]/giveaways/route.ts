import { NextResponse } from "next/server";

import { createGuildApiHandler } from "@/lib/api-handler";
import { listGiveaways } from "@/lib/giveaways";
import { READ_RATE } from "@/lib/rate-limit";

/** 진행 중·지난 기브어웨이 목록 (서버 관리 권한, 읽기 전용) */
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
