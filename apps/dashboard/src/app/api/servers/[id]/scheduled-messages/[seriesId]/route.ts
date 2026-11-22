import { NextResponse } from "next/server";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { WRITE_RATE } from "@/lib/rate-limit";
import { deleteScheduledMessage } from "@/lib/scheduled-messages";

const seriesIdSchema = z.string().uuid();

/** 예약 삭제 — 같은 예약의 대기·실패·끝난 회차를 모두 지워요. 이미 보내는 중인 회차는 막을 수 없어요 */
export const DELETE = createGuildApiHandler({
  role: "manage",
  rate: WRITE_RATE,
  key: "scheduled-messages-delete",
  handler: async ({ guildId, params }) => {
    const seriesId = seriesIdSchema.safeParse(params.seriesId);
    if (!seriesId.success) {
      return NextResponse.json({ error: "예약 ID가 올바르지 않아요." }, { status: 400 });
    }
    try {
      const removed = await deleteScheduledMessage(guildId, seriesId.data);
      if (!removed) {
        return NextResponse.json({ error: "예약을 찾을 수 없어요." }, { status: 404 });
      }
      return NextResponse.json({ ok: true });
    } catch (error) {
      console.error("Failed to delete scheduled message:", error);
      return NextResponse.json({ error: "요청을 처리하지 못했어요." }, { status: 500 });
    }
  },
});
