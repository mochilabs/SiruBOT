import { NextResponse } from "next/server";
import {
  rolePanelUpdateSchema,
  validateReactionButtons,
} from "@sirubot/utils/rolePanel";

import { createGuildApiHandler } from "@/lib/api-handler";
import { notifyGuildSettingsChanged } from "@/lib/data-api/client";
import { requestPanelPost } from "@/lib/data-api/panel";
import { rejectUnassignableRoles } from "@/lib/data-api/role-panel-validation";
import { db } from "@/lib/db";
import { READ_RATE, WRITE_RATE } from "@/lib/rate-limit";

export const GET = createGuildApiHandler({
  role: "manage",
  rate: READ_RATE,
  key: "role-panel-get",
  handler: async ({ guildId, params }) => {
    try {
      const panel = await db.rolePanel.findUnique({
        where: { id: params.panelId },
        include: { buttons: { orderBy: { position: "asc" } } },
      });
      if (!panel || panel.guildId !== guildId) {
        return NextResponse.json(
          { error: "역할 패널을 찾을 수 없어요." },
          { status: 404 },
        );
      }
      return NextResponse.json(panel);
    } catch (error) {
      console.error("Failed to load role panel:", error);
      return NextResponse.json(
        { error: "요청을 처리하지 못했어요." },
        { status: 500 },
      );
    }
  },
});

export const PUT = createGuildApiHandler({
  role: "manage",
  rate: WRITE_RATE,
  key: "role-panel-put",
  schema: rolePanelUpdateSchema,
  handler: async ({ guildId, params, data }) => {
    try {
      const existing = await db.rolePanel.findUnique({
        where: { id: params.panelId },
        include: { buttons: true },
      });
      if (!existing || existing.guildId !== guildId) {
        return NextResponse.json(
          { error: "역할 패널을 찾을 수 없어요." },
          { status: 404 },
        );
      }

      const finalMode = data.mode ?? existing.mode;
      if (finalMode === "reaction" && (data.mode || data.buttons)) {
        const reason = validateReactionButtons(
          data.buttons ?? existing.buttons,
        );
        if (reason) {
          return NextResponse.json({ error: reason }, { status: 400 });
        }
      }

      if (data.buttons) {
        const rejected = await rejectUnassignableRoles(
          guildId,
          data.buttons.map((button) => button.roleId),
        );
        if (rejected) return rejected;
      }

      const updated = await db.$transaction(async (tx) => {
        if (data.buttons) {
          const current = await tx.rolePanelButton.findMany({
            where: { panelId: params.panelId },
            select: { id: true },
          });
          const currentIds = new Set(current.map((button) => button.id));
          const keepIds = new Set(
            data.buttons
              .map((button) => button.id)
              .filter((id): id is string => !!id && currentIds.has(id)),
          );
          await tx.rolePanelButton.deleteMany({
            where: {
              panelId: params.panelId,
              id: { notIn: [...keepIds] },
            },
          });
          for (const [index, button] of data.buttons.entries()) {
            const fields = {
              roleId: button.roleId,
              label: button.label,
              emoji: button.emoji ?? null,
              style: button.style ?? "secondary",
              position: button.position ?? index,
            };
            if (button.id && keepIds.has(button.id)) {
              await tx.rolePanelButton.update({
                where: { id: button.id },
                data: fields,
              });
            } else {
              await tx.rolePanelButton.create({
                data: { ...fields, panelId: params.panelId },
              });
            }
          }
        }
        return tx.rolePanel.update({
          where: { id: params.panelId },
          data: {
            ...(data.name !== undefined ? { name: data.name } : {}),
            ...(data.title !== undefined ? { title: data.title } : {}),
            ...(data.description !== undefined
              ? { description: data.description }
              : {}),
            ...(data.imageUrl !== undefined
              ? { imageUrl: data.imageUrl }
              : {}),
            ...(data.imageLayout !== undefined
              ? { imageLayout: data.imageLayout }
              : {}),
            ...(data.imagePosition !== undefined
              ? { imagePosition: data.imagePosition }
              : {}),
            ...(data.accentColor !== undefined
              ? { accentColor: data.accentColor }
              : {}),
            ...(data.mode !== undefined ? { mode: data.mode } : {}),
          },
          include: { buttons: { orderBy: { position: "asc" } } },
        });
      });

      let refreshed: boolean | null = null;
      if (existing.channelId && existing.messageId) {
        const refresh = await requestPanelPost(guildId, "rolePanel", {
          panelId: params.panelId,
          refresh: true,
        });
        refreshed = refresh.ok;
        if (!refresh.ok) {
          console.warn(
            `Failed to refresh posted role panel (guild ${guildId}, panel ${params.panelId}): ${refresh.error ?? refresh.status}`,
          );
        }
      }

      notifyGuildSettingsChanged(guildId).catch((error) => {
        console.warn(
          `Failed to notify role panel update (guild ${guildId}):`,
          error,
        );
      });

      return NextResponse.json({ ...updated, refreshed });
    } catch (error) {
      console.error("Failed to update role panel:", error);
      return NextResponse.json(
        { error: "요청을 처리하지 못했어요." },
        { status: 500 },
      );
    }
  },
});

export const DELETE = createGuildApiHandler({
  role: "manage",
  rate: WRITE_RATE,
  key: "role-panel-delete",
  handler: async ({ guildId, params }) => {
    try {
      const existing = await db.rolePanel.findUnique({
        where: { id: params.panelId },
      });
      if (!existing || existing.guildId !== guildId) {
        return NextResponse.json(
          { error: "역할 패널을 찾을 수 없어요." },
          { status: 404 },
        );
      }

      await db.rolePanel.delete({ where: { id: params.panelId } });

      notifyGuildSettingsChanged(guildId).catch((error) => {
        console.warn(
          `Failed to notify role panel delete (guild ${guildId}):`,
          error,
        );
      });

      return NextResponse.json({ ok: true });
    } catch (error) {
      console.error("Failed to delete role panel:", error);
      return NextResponse.json(
        { error: "요청을 처리하지 못했어요." },
        { status: 500 },
      );
    }
  },
});
