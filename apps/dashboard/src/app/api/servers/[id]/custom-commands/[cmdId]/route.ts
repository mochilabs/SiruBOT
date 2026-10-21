import { NextResponse } from "next/server";
import {
  customCommandPatchSchema,
  validateCustomCommandName,
} from "@sirubot/utils/customCommand";

import { createGuildApiHandler } from "@/lib/api-handler";
import { normalizedCommandName, readCustomCommandsState } from "@/lib/custom-commands";
import { notifyGuildSettingsChanged } from "@/lib/data-api";
import { db } from "@/lib/db";
import { WRITE_RATE } from "@/lib/rate-limit";
import { parseSettingBody } from "@/lib/schemas";

/**
 * 커스텀 명령어 수정 — 이름·설명·스펙 중 보내준 것만 바꿔요.
 * 실행 방식(method)은 불변이에요 — 허용 필드에 없어 보내면 400으로 거부돼요.
 */
export const PATCH = createGuildApiHandler({
  role: "manage",
  rate: WRITE_RATE,
  key: "custom-commands-patch",
  handler: async ({ guildId, params, request }) => {
    const { cmdId } = params;
    try {
      const body = await parseSettingBody(request, customCommandPatchSchema, [
        "name",
        "description",
        "spec",
      ]);
      if (!body.ok) return body.response;

      // 소유 검증 — 다른 길드의 명령어는 건드릴 수 없어요
      const existing = await db.customCommand.findFirst({
        where: { id: cmdId, guildId },
      });
      if (!existing) {
        return NextResponse.json(
          { error: "찾을 수 없는 커스텀 명령어예요." },
          { status: 404 },
        );
      }

      const data: {
        name?: string;
        description?: string;
        spec?: object;
      } = {};
      if (body.data.name !== undefined) {
        const name = normalizedCommandName(body.data.name);
        const method = existing.method === "slash" ? "slash" : "prefix";
        const nameError = validateCustomCommandName(name, method);
        if (nameError) {
          return NextResponse.json({ error: nameError }, { status: 400 });
        }
        if (name !== existing.name) {
          const duplicate = await db.customCommand.findFirst({
            where: { guildId, name, NOT: { id: cmdId } },
          });
          if (duplicate) {
            return NextResponse.json(
              { error: "이미 있는 이름이에요." },
              { status: 409 },
            );
          }
        }
        data.name = name;
      }
      if (body.data.description !== undefined) data.description = body.data.description;
      if (body.data.spec !== undefined) data.spec = body.data.spec as object;

      if (Object.keys(data).length > 0) {
        await db.customCommand.update({ where: { id: cmdId }, data });
        notifyGuildSettingsChanged(guildId).catch((error) => {
          console.warn(
            `Failed to notify custom command change (guild ${guildId}):`,
            error,
          );
        });
      }

      return NextResponse.json(await readCustomCommandsState(guildId));
    } catch (error) {
      console.error("Failed to update custom command:", error);
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
  key: "custom-commands-delete",
  handler: async ({ guildId, params }) => {
    const { cmdId } = params;
    try {
      const existing = await db.customCommand.findFirst({
        where: { id: cmdId, guildId },
      });
      if (!existing) {
        return NextResponse.json(
          { error: "찾을 수 없는 커스텀 명령어예요." },
          { status: 404 },
        );
      }

      await db.customCommand.delete({ where: { id: cmdId } });
      notifyGuildSettingsChanged(guildId).catch((error) => {
        console.warn(
          `Failed to notify custom command change (guild ${guildId}):`,
          error,
        );
      });

      return NextResponse.json(await readCustomCommandsState(guildId));
    } catch (error) {
      console.error("Failed to delete custom command:", error);
      return NextResponse.json(
        { error: "요청을 처리하지 못했어요." },
        { status: 500 },
      );
    }
  },
});
