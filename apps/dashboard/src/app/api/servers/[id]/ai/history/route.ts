import { NextResponse } from "next/server";

import { createGuildApiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { WRITE_RATE } from "@/lib/rate-limit";

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
