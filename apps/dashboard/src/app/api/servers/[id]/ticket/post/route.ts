import { NextResponse } from "next/server";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { requestPanelPost } from "@/lib/data-api/panel";
import { WRITE_RATE } from "@/lib/rate-limit";

const postSchema = z.object({
  channelId: z
    .string()
    .regex(/^\d{17,20}$/, "올바른 ID 형식이 아니에요.")
    .optional(),
});

/**
 * 티켓 패널 게시 — 봇 토큰이 필요한 작업이라 data-api → Redis로 봇에 위임해요.
 * channelId를 생략하면 설정에 저장된 panelChannelId로 게시해요.
 */
export const POST = createGuildApiHandler({
  role: "manage",
  rate: WRITE_RATE,
  key: "ticket-panel-post",
  schema: postSchema,
  handler: async ({ guildId, data }) => {
    try {
      const result = await requestPanelPost(guildId, "ticket", {
        channelId: data.channelId,
      });
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error ?? "티켓 패널을 게시하지 못했어요." },
          { status: result.status >= 400 ? result.status : 502 },
        );
      }
      return NextResponse.json({
        ok: true,
        messageId: result.messageId,
        channelId: result.channelId,
      });
    } catch (error) {
      console.error("Failed to post ticket panel:", error);
      return NextResponse.json(
        { error: "요청을 처리하지 못했어요." },
        { status: 500 },
      );
    }
  },
});
