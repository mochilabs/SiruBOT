import { NextResponse } from "next/server";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { WRITE_RATE } from "@/lib/rate-limit";

const voiceSchema = z.object({
  voice: z.string().trim().min(1).max(120).nullable(),
});

export const PUT = createGuildApiHandler({
  role: "member",
  rate: WRITE_RATE,
  key: "tts-me-put",
  schema: voiceSchema,
  invalidMessage: "음성 값이 올바르지 않아요.",
  handler: async ({ guildId, authz, data }) => {
    try {
      const installed = await db.guild.findUnique({ where: { id: guildId }, select: { id: true } });
      if (!installed) return NextResponse.json({ error: "시루봇이 있는 서버가 아니에요." }, { status: 404 });
      await db.ttsUserSetting.upsert({
        where: { guildId_userId: { guildId, userId: authz.userId } },
        create: { guildId, userId: authz.userId, voice: data.voice },
        update: { voice: data.voice },
      });
      return NextResponse.json({ voice: data.voice });
    } catch (error) {
      console.error("Failed to save tts voice:", error);
      return NextResponse.json({ error: "TTS 음성을 저장하지 못했어요." }, { status: 500 });
    }
  },
});
