import { NextResponse } from "next/server";

import { createGuildApiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { WRITE_RATE } from "@/lib/rate-limit";

/** 이 서버의 AI 대화 기록을 모두 삭제해요 (봇 캐시는 다음 턴에 자동으로 DB와 동기화) */
export const DELETE = createGuildApiHandler({
  role: "manage",
  rate: WRITE_RATE,
  key: "ai-history-delete",
  handler: async ({ guildId }) => {
    try {
      const result = await db.channelChatHistory.deleteMany({
        where: { guildId },
      });
      return NextResponse.json({ deleted: result.count });
    } catch (error) {
      console.error("Failed to delete chat history:", error);
      return NextResponse.json(
        { error: "요청을 처리하지 못했어요." },
        { status: 500 },
      );
    }
  },
});
