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

/**
 * 역할 패널 단건 조회·수정·삭제.
 *
 * GET: 단일 패널(버튼 포함).
 * PUT: 패널 필드 + 버튼 목록 동기화. 저장 전 역할 부여 가능 여부를 봇에 검증해요:
 *   - 결정적 무효(봇이 "부여 불가" 답) → 400 거부 + 문제 역할 안내.
 *   - 통신 장애(봇 다운·Redis timeout) → 경고 없이 통과(패널은 저장, 클릭 시점에 검증).
 *   버튼은 id 기준 upsert라 기존 버튼 id가 유지돼요 — 이미 게시된 메시지의 customId가 계속 유효해요.
 *   저장 후 게시된 패널이 있으면 봇에 제자리 갱신(refresh)을 요청해요.
 * DELETE: 패널 삭제.
 */

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

      // 반응 방식 규칙(모든 역할에 이모지·중복 금지·20개 이하)을 저장될 최종 상태 기준으로 검사해요.
      // mode나 buttons 중 하나만 와도 나머지는 저장된 값과 합쳐서 봐요.
      const finalMode = data.mode ?? existing.mode;
      if (finalMode === "reaction" && (data.mode || data.buttons)) {
        const reason = validateReactionButtons(
          data.buttons ?? existing.buttons,
        );
        if (reason) {
          return NextResponse.json({ error: reason }, { status: 400 });
        }
      }

      // 버튼 목록이 오면 저장 전에 역할 부여 가능 여부를 봇에 검증해요.
      if (data.buttons) {
        const rejected = await rejectUnassignableRoles(
          guildId,
          data.buttons.map((button) => button.roleId),
        );
        if (rejected) return rejected;
      }

      // 패널 필드 갱신 + 버튼 동기화: 기존 id는 update(id 유지), 새 버튼은 create, 빠진 버튼은 delete.
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
            ...(data.mode !== undefined ? { mode: data.mode } : {}),
          },
          include: { buttons: { orderBy: { position: "asc" } } },
        });
      });

      // 게시된 메시지에 편집 내용을 반영해요 (best-effort — 실패해도 저장은 성공).
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
