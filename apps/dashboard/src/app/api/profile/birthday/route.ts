import { NextResponse } from "next/server";
import { birthdayInputSchema } from "@sirubot/utils/birthday";

import { createGuildApiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { WRITE_RATE } from "@/lib/rate-limit";
import { getZodiac } from "@/lib/zodiac";

/**
 * 내 생일 저장 (PUT /api/profile/birthday) — 봇 `/프로필 생일설정`과 같은 User.birthMonth/birthDay를 써요.
 * 봇은 생일을 캐시하지 않고 매번 DB에서 읽어서 저장 즉시 별자리 운세·프로필에 반영돼요.
 */
export const PUT = createGuildApiHandler({
  role: "user",
  rate: WRITE_RATE,
  key: "profile-birthday-put",
  schema: birthdayInputSchema,
  invalidMessage: "생일 날짜가 올바르지 않아요.",
  handler: async ({ data, authz }) => {
    const { month, day } = data;
    try {
      await db.user.upsert({
        where: { id: authz.userId },
        create: { id: authz.userId, birthMonth: month, birthDay: day },
        update: { birthMonth: month, birthDay: day },
      });
      return NextResponse.json({ month, day, zodiac: getZodiac(month, day) });
    } catch (error) {
      console.error("Failed to save birthday:", error);
      return NextResponse.json({ error: "생일을 저장하지 못했어요." }, { status: 500 });
    }
  },
});

/** 내 생일 삭제 (DELETE /api/profile/birthday) — 등록된 생일이 없어도 성공으로 응답해요 */
export const DELETE = createGuildApiHandler({
  role: "user",
  rate: WRITE_RATE,
  key: "profile-birthday-delete",
  handler: async ({ authz }) => {
    try {
      await db.user.updateMany({ where: { id: authz.userId }, data: { birthMonth: null, birthDay: null } });
      return NextResponse.json({ month: null, day: null, zodiac: null });
    } catch (error) {
      console.error("Failed to clear birthday:", error);
      return NextResponse.json({ error: "생일을 지우지 못했어요." }, { status: 500 });
    }
  },
});
