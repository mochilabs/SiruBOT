import { NextResponse } from "next/server";
import {
  customCommandPayloadSchema,
  validateCustomCommandName,
  validateCustomCommandPrefix,
} from "@sirubot/utils/customCommand";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import {
  MAX_CUSTOM_COMMANDS_PER_GUILD,
  MAX_SLASH_COMMANDS_PER_GUILD,
  normalizedCommandName,
  readCustomCommandsState,
} from "@/lib/custom-commands";
import { notifyGuildSettingsChanged } from "@/lib/data-api/client";
import { db } from "@/lib/db";
import { READ_RATE, WRITE_RATE } from "@/lib/rate-limit";
import { parseSettingBody } from "@/lib/schemas";

/** 커스텀 명령어 관리 — GET 목록 / POST 생성 / PUT 접두사 변경 (관리자 전용) */
export const GET = createGuildApiHandler({
  role: "manage",
  rate: READ_RATE,
  key: "custom-commands-get",
  handler: async ({ guildId }) => {
    try {
      return NextResponse.json(await readCustomCommandsState(guildId));
    } catch (error) {
      console.error("Failed to load custom commands:", error);
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
  key: "custom-commands-post",
  handler: async ({ guildId, authz, request }) => {
    try {
      const body = await parseSettingBody(
        request,
        customCommandPayloadSchema,
        ["name", "description", "method", "spec"],
      );
      if (!body.ok) return body.response;

      const name = normalizedCommandName(body.data.name);
      const nameError = validateCustomCommandName(name, body.data.method);
      if (nameError) {
        return NextResponse.json({ error: nameError }, { status: 400 });
      }

      // CustomCommand는 Guild FK를 가져요 — 길드 행이 아직 없으면 먼저 만들어 둬요
      await db.guild.upsert({ where: { id: guildId }, create: { id: guildId }, update: {} });

      const count = await db.customCommand.count({ where: { guildId } });
      if (count >= MAX_CUSTOM_COMMANDS_PER_GUILD) {
        return NextResponse.json(
          {
            error: `커스텀 명령어는 서버당 최대 ${MAX_CUSTOM_COMMANDS_PER_GUILD}개까지 만들 수 있어요.`,
          },
          { status: 400 },
        );
      }

      if (body.data.method === "slash") {
        const slashCount = await db.customCommand.count({
          where: { guildId, method: "slash" },
        });
        if (slashCount >= MAX_SLASH_COMMANDS_PER_GUILD) {
          return NextResponse.json(
            {
              error: `슬래시 명령어는 서버당 최대 ${MAX_SLASH_COMMANDS_PER_GUILD}개까지 등록할 수 있어요 (봇 명령어 슬롯 보호).`,
            },
            { status: 400 },
          );
        }
      }

      const existing = await db.customCommand.findFirst({
        where: { guildId, name },
      });
      if (existing) {
        return NextResponse.json(
          { error: "이미 있는 이름이에요." },
          { status: 409 },
        );
      }

      await db.customCommand.create({
        data: {
          guildId,
          name,
          description: body.data.description,
          method: body.data.method,
          spec: body.data.spec as object,
          createdBy: authz.userId,
        },
      });

      // 저장 성공 후 봇 캐시 무효화 (fire-and-forget) — 실패해도 봇이 TTL로 최신을 읽어요
      notifyGuildSettingsChanged(guildId).catch((error) => {
        console.warn(
          `Failed to notify custom command change (guild ${guildId}):`,
          error,
        );
      });

      return NextResponse.json(await readCustomCommandsState(guildId));
    } catch (error) {
      console.error("Failed to create custom command:", error);
      return NextResponse.json(
        { error: "요청을 처리하지 못했어요." },
        { status: 500 },
      );
    }
  },
});

const prefixBodySchema = z.object({ prefix: z.string() });

/** 접두사 변경 — 예: '!' → '?' */
export const PUT = createGuildApiHandler({
  role: "manage",
  rate: WRITE_RATE,
  key: "custom-commands-prefix-put",
  handler: async ({ guildId, request }) => {
    try {
      const body = await parseSettingBody(request, prefixBodySchema, ["prefix"]);
      if (!body.ok) return body.response;

      const prefixError = validateCustomCommandPrefix(body.data.prefix);
      if (prefixError) {
        return NextResponse.json({ error: prefixError }, { status: 400 });
      }

      await db.guild.upsert({
        where: { id: guildId },
        create: { id: guildId, customCommandPrefix: body.data.prefix },
        update: { customCommandPrefix: body.data.prefix },
      });

      notifyGuildSettingsChanged(guildId).catch((error) => {
        console.warn(`Failed to notify prefix change (guild ${guildId}):`, error);
      });

      return NextResponse.json(await readCustomCommandsState(guildId));
    } catch (error) {
      console.error("Failed to update command prefix:", error);
      return NextResponse.json(
        { error: "요청을 처리하지 못했어요." },
        { status: 500 },
      );
    }
  },
});
