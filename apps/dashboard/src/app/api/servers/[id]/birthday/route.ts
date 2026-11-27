import { NextResponse } from "next/server";
import { birthdaySettingsInputSchema } from "@sirubot/utils/birthdayCelebration";

import { createGuildApiHandler } from "@/lib/api-handler";
import { BirthdayRejected, getBirthdaySettings, saveBirthdaySettings } from "@/lib/birthday-celebration";
import { READ_RATE, WRITE_RATE } from "@/lib/rate-limit";

export const GET = createGuildApiHandler({
  role: "manage",
  rate: READ_RATE,
  key: "birthday-get",
  handler: async ({ guildId }) => {
    try {
      return NextResponse.json(await getBirthdaySettings(guildId));
    } catch (error) {
      console.error("Failed to load birthday settings:", error);
      return NextResponse.json({ error: "요청을 처리하지 못했어요." }, { status: 500 });
    }
  },
});

export const PUT = createGuildApiHandler({
  role: "manage",
  rate: WRITE_RATE,
  key: "birthday-put",
  schema: birthdaySettingsInputSchema,
  invalidMessage: "생일 축하 설정이 올바르지 않아요.",
  handler: async ({ guildId, data }) => {
    try {
      return NextResponse.json(await saveBirthdaySettings(guildId, data));
    } catch (error) {
      if (error instanceof BirthdayRejected) return NextResponse.json({ error: error.message }, { status: 400 });
      console.error("Failed to save birthday settings:", error);
      return NextResponse.json({ error: "요청을 처리하지 못했어요." }, { status: 500 });
    }
  },
});
