import { NextResponse } from "next/server";

import { createGuildApiHandler } from "@/lib/api-handler";
import { listMyBirthdayGuildIds } from "@/lib/birthday-celebration";
import { READ_RATE } from "@/lib/rate-limit";

export const GET = createGuildApiHandler({
  role: "user",
  rate: READ_RATE,
  key: "profile-birthday-guilds-get",
  handler: async ({ authz }) => {
    try {
      return NextResponse.json({ guildIds: await listMyBirthdayGuildIds(authz.userId) });
    } catch (error) {
      console.error("Failed to read birthday opt-ins:", error);
      return NextResponse.json({ error: "생일 축하 설정을 불러오지 못했어요." }, { status: 500 });
    }
  },
});
