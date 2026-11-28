import { NextResponse } from "next/server";
import {
  customCommandPatchSchema,
  normalizeCustomCommandName,
  validateCustomCommandName,
} from "@sirubot/utils/customCommand";

import { createGuildApiHandler } from "@/lib/api-handler";
import { readCustomCommandsState } from "@/lib/custom-commands";
import { notifyGuildSettingsChanged } from "@/lib/data-api/client";
import { db } from "@/lib/db";
import { WRITE_RATE } from "@/lib/rate-limit";
import { parseSettingBody } from "@/lib/schemas";

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
        const name = normalizeCustomCommandName(body.data.name);
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
