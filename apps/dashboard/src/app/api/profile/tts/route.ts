import { NextResponse } from "next/server";

import { createGuildApiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { READ_RATE } from "@/lib/rate-limit";

/** 내 서버별 TTS 음성 (GET /api/profile/tts) — { [guildId]: "engine:voice" } 만 돌려줘요. */
export const GET = createGuildApiHandler({
  role: "user",
  rate: READ_RATE,
  key: "profile-tts-get",
  handler: async ({ authz }) => {
    try {
      const rows = await db.ttsUserSetting.findMany({
        where: { userId: authz.userId, voice: { not: null } },
        select: { guildId: true, voice: true },
      });
      const voices: Record<string, string> = {};
      for (const row of rows) if (row.voice) voices[row.guildId] = row.voice;
      return NextResponse.json({ voices });
    } catch (error) {
      console.error("Failed to read tts voices:", error);
      return NextResponse.json({ error: "TTS 음성을 불러오지 못했어요." }, { status: 500 });
    }
  },
});
