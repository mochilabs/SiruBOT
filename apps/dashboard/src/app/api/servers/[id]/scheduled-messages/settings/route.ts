import { NextResponse } from "next/server";
import {
  SCHEDULED_MESSAGE_SETTINGS_DEFAULTS,
  scheduledMessageSettingsPatchSchema,
} from "@sirubot/utils/scheduledMessage";

import { createGuildApiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { WRITE_RATE } from "@/lib/rate-limit";

export const PUT = createGuildApiHandler({
  role: "manage",
  rate: WRITE_RATE,
  key: "scheduled-messages-settings-put",
  schema: scheduledMessageSettingsPatchSchema,
  handler: async ({ guildId, data }) => {
    try {
      await db.guild.upsert({ where: { id: guildId }, create: { id: guildId }, update: {} });
      const row = await db.scheduledMessageSettings.upsert({
        where: { guildId },
        create: { guildId, ...SCHEDULED_MESSAGE_SETTINGS_DEFAULTS, ...data },
        update: data,
      });
      return NextResponse.json({ maxActive: row.maxActive, minIntervalMinutes: row.minIntervalMinutes });
    } catch (error) {
      console.error("Failed to update scheduled message settings:", error);
      return NextResponse.json({ error: "요청을 처리하지 못했어요." }, { status: 500 });
    }
  },
});
