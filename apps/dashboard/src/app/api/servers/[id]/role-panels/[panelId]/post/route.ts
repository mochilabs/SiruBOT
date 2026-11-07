import { NextResponse } from "next/server";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { requestPanelPost } from "@/lib/data-api/panel";
import { db } from "@/lib/db";
import { WRITE_RATE } from "@/lib/rate-limit";

const postSchema = z.object({
  channelId: z
    .string()
    .regex(/^\d{17,20}$/, "올바른 ID 형식이 아니에요.")
    .optional(),
});

/**
 * 역할 패널 게시 — 봇 토큰이 필요한 작업이라 data-api → Redis로 봇에 위임해요.
 * 패널이 이 길드 소유인지 먼저 확인해요 (다른 길드의 panelId로 게시 불가).
 * channelId를 생략하면 패널에 저장된 채널로 다시 게시해요.
 */
export const POST = createGuildApiHandler({
  role: "manage",
  rate: WRITE_RATE,
  key: "role-panel-post",
  schema: postSchema,
  handler: async ({ guildId, params, data }) => {
    try {
      const panel = await db.rolePanel.findUnique({
        where: { id: params.panelId },
        select: { guildId: true },
      });
      if (!panel || panel.guildId !== guildId) {
        return NextResponse.json(
          { error: "역할 패널을 찾을 수 없어요." },
          { status: 404 },
        );
      }

      const result = await requestPanelPost(guildId, "rolePanel", {
        panelId: params.panelId,
        channelId: data.channelId,
      });
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error ?? "패널을 게시하지 못했어요." },
          { status: result.status >= 400 ? result.status : 502 },
        );
      }
      return NextResponse.json({
        ok: true,
        messageId: result.messageId,
        channelId: result.channelId,
      });
    } catch (error) {
      console.error("Failed to post role panel:", error);
      return NextResponse.json(
        { error: "요청을 처리하지 못했어요." },
        { status: 500 },
      );
    }
  },
});
