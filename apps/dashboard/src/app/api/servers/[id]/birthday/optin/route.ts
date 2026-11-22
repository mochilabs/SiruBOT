import { NextResponse } from "next/server";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { setMyBirthdayOptIn } from "@/lib/birthday-celebration";
import { db } from "@/lib/db";
import { WRITE_RATE } from "@/lib/rate-limit";

const bodySchema = z.object({ enabled: z.boolean() });

/** 이 서버에서 내 생일 축하를 받을지 (서버 멤버) — 봇 `/프로필 생일축하`와 같은 BirthdayOptIn이에요 */
export const PUT = createGuildApiHandler({
  role: "member",
  rate: WRITE_RATE,
  key: "birthday-optin-put",
  schema: bodySchema,
  invalidMessage: "요청 값이 올바르지 않아요.",
  handler: async ({ guildId, authz, data }) => {
    try {
      const installed = await db.guild.findUnique({ where: { id: guildId }, select: { id: true } });
      if (!installed) return NextResponse.json({ error: "시루봇이 있는 서버가 아니에요." }, { status: 404 });
      await setMyBirthdayOptIn(guildId, authz.userId, data.enabled);
      return NextResponse.json({ enabled: data.enabled });
    } catch (error) {
      console.error("Failed to save birthday opt-in:", error);
      return NextResponse.json({ error: "설정을 저장하지 못했어요." }, { status: 500 });
    }
  },
});
