import { NextResponse } from "next/server";
import { rolePanelCreateSchema } from "@sirubot/utils/rolePanel";

import { createGuildApiHandler } from "@/lib/api-handler";
import { notifyGuildSettingsChanged } from "@/lib/data-api/client";
import { rejectUnassignableRoles } from "@/lib/data-api/role-panel-validation";
import { db } from "@/lib/db";
import { READ_RATE, WRITE_RATE } from "@/lib/rate-limit";

/**
 * 역할 패널 목록·생성 — 길드당 여러 개(1:N)의 셀프 역할 패널.
 *
 * GET: 패널 목록(버튼 포함, clickCount 통계).
 * POST: 신규 패널 생성(이름·제목·안내문 + 버튼 목록).
 */

export const GET = createGuildApiHandler({
  role: "manage",
  rate: READ_RATE,
  key: "role-panels-list",
  handler: async ({ guildId }) => {
    try {
      const panels = await db.rolePanel.findMany({
        where: { guildId },
        include: { buttons: { orderBy: { position: "asc" } } },
        orderBy: { createdAt: "asc" },
      });
      return NextResponse.json(panels);
    } catch (error) {
      console.error("Failed to load role panels:", error);
      return NextResponse.json(
        { error: "요청을 처리하지 못했어요." },
        { status: 500 },
      );
    }
  },
});

export const POST = createGuildApiHandler({
  role: "manage",
  rate: WRITE_RATE,
  key: "role-panels-create",
  schema: rolePanelCreateSchema,
  handler: async ({ guildId, data }) => {
    try {
      const rejected = await rejectUnassignableRoles(
        guildId,
        data.buttons.map((button) => button.roleId),
      );
      if (rejected) return rejected;

      await db.guild.upsert({
        where: { id: guildId },
        create: { id: guildId },
        update: {},
      });

      const panel = await db.rolePanel.create({
        data: {
          guildId,
          name: data.name,
          title: data.title ?? "역할 패널",
          description:
            data.description ??
            "아래 버튼을 눌러 원하는 역할을 받거나 해제하세요.",
          mode: data.mode,
          buttons: {
            create: data.buttons.map((button, index) => ({
              roleId: button.roleId,
              label: button.label,
              emoji: button.emoji ?? null,
              style: button.style ?? "secondary",
              position: button.position ?? index,
            })),
          },
        },
        include: { buttons: { orderBy: { position: "asc" } } },
      });

      notifyGuildSettingsChanged(guildId).catch((error) => {
        console.warn(
          `Failed to notify role panel create (guild ${guildId}):`,
          error,
        );
      });

      return NextResponse.json(panel);
    } catch (error) {
      console.error("Failed to create role panel:", error);
      return NextResponse.json(
        { error: "요청을 처리하지 못했어요." },
        { status: 500 },
      );
    }
  },
});
