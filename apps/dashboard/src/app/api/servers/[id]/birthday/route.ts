import { NextResponse } from "next/server";
import { birthdaySettingsInputSchema } from "@sirubot/utils/birthdayCelebration";

import { createGuildApiHandler } from "@/lib/api-handler";
import { BirthdayRejected, getBirthdaySettings, saveBirthdaySettings } from "@/lib/birthday-celebration";
import { READ_RATE, WRITE_RATE } from "@/lib/rate-limit";

/** 서버의 생일 축하 설정 (서버 관리 권한) */
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

/**
 * 설정 저장 — 카드·메시지는 인사 카드와 같은 스키마로 검증해요. 새로 켜면 다음 날부터 축하하고,
 * 다음 작업은 DB에 바로 예약해요 (봇은 DB를 읽어서 따로 알릴 필요가 없어요).
 */
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
