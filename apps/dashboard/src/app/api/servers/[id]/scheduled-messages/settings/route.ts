import { NextResponse } from "next/server";
import {
  SCHEDULED_MESSAGE_SETTINGS_DEFAULTS,
  scheduledMessageSettingsPatchSchema,
} from "@sirubot/utils/scheduledMessage";

import { createGuildApiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { WRITE_RATE } from "@/lib/rate-limit";

/** 예약 메시지 상한·간격 저장 (기본값은 활성 25개, 같은 채널 10분). 봇은 예약을 만들 때마다 DB에서 읽어요 */
export const PUT = createGuildApiHandler({
  role: "manage",
  rate: WRITE_RATE,
  key: "scheduled-messages-settings-put",
  schema: scheduledMessageSettingsPatchSchema,
  handler: async ({ guildId, data }) => {
    try {
      // 설정 행은 Guild를 외래키로 참조해요 — 봇이 아직 만들지 않은 길드여도 저장되게 먼저 보장해요
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
