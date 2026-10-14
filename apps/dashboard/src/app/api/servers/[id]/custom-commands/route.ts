import { NextResponse } from "next/server";
import {
  customCommandPayloadSchema,
  validateCustomCommandName,
  validateCustomCommandPrefix,
} from "@sirubot/utils/customCommand";
import { z } from "zod";

import { authorizeGuildManage, deniedGuildManage } from "@/lib/api-guards";
import {
  MAX_CUSTOM_COMMANDS_PER_GUILD,
  normalizedCommandName,
  readCustomCommandsState,
} from "@/lib/custom-commands";
import { notifyGuildSettingsChanged } from "@/lib/data-api";
import { db } from "@/lib/db";
import { guardRateLimit, rateKey, WRITE_RATE } from "@/lib/rate-limit";
import { parseSettingBody } from "@/lib/schemas";

/** 커스텀 명령어 관리 — GET 목록 / POST 생성 / PUT 접두사 변경 (관리자 전용) */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authz = await authorizeGuildManage(id);
  if (!authz.ok) return deniedGuildManage(authz);
  try {
    return NextResponse.json(await readCustomCommandsState(id));
  } catch (error) {
    console.error("Failed to load custom commands:", error);
    return NextResponse.json(
      { error: "요청을 처리하지 못했어요." },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authz = await authorizeGuildManage(id);
  if (!authz.ok) return deniedGuildManage(authz);

  const limited = await guardRateLimit(
    rateKey("custom-commands-post", authz.userId, id),
    WRITE_RATE,
  );
  if (limited) return limited;

  try {
    const body = await parseSettingBody(request, customCommandPayloadSchema, [
      "name",
      "description",
      "spec",
    ]);
    if (!body.ok) return body.response;

    const name = normalizedCommandName(body.data.name);
    const nameError = validateCustomCommandName(name);
    if (nameError) {
      return NextResponse.json({ error: nameError }, { status: 400 });
    }

    // CustomCommand는 Guild FK를 가져요 — 길드 행이 아직 없으면 먼저 만들어 둬요
    await db.guild.upsert({ where: { id }, create: { id }, update: {} });

    const count = await db.customCommand.count({ where: { guildId: id } });
    if (count >= MAX_CUSTOM_COMMANDS_PER_GUILD) {
      return NextResponse.json(
        {
          error: `커스텀 명령어는 서버당 최대 ${MAX_CUSTOM_COMMANDS_PER_GUILD}개까지 만들 수 있어요.`,
        },
        { status: 400 },
      );
    }

    const existing = await db.customCommand.findFirst({
      where: { guildId: id, name },
    });
    if (existing) {
      return NextResponse.json(
        { error: "이미 있는 이름이에요." },
        { status: 409 },
      );
    }

    await db.customCommand.create({
      data: {
        guildId: id,
        name,
        description: body.data.description,
        spec: body.data.spec as object,
        createdBy: authz.userId,
      },
    });

    // 저장 성공 후 봇 캐시 무효화 (fire-and-forget) — 실패해도 봇이 TTL로 최신을 읽어요
    notifyGuildSettingsChanged(id).catch((error) => {
      console.warn(
        `Failed to notify custom command change (guild ${id}):`,
        error,
      );
    });

    return NextResponse.json(await readCustomCommandsState(id));
  } catch (error) {
    console.error("Failed to create custom command:", error);
    return NextResponse.json(
      { error: "요청을 처리하지 못했어요." },
      { status: 500 },
    );
  }
}

const prefixBodySchema = z.object({ prefix: z.string() });

/** 접두사 변경 — 예: '!' → '?' */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authz = await authorizeGuildManage(id);
  if (!authz.ok) return deniedGuildManage(authz);

  const limited = await guardRateLimit(
    rateKey("custom-commands-prefix-put", authz.userId, id),
    WRITE_RATE,
  );
  if (limited) return limited;

  try {
    const body = await parseSettingBody(request, prefixBodySchema, ["prefix"]);
    if (!body.ok) return body.response;

    const prefixError = validateCustomCommandPrefix(body.data.prefix);
    if (prefixError) {
      return NextResponse.json({ error: prefixError }, { status: 400 });
    }

    await db.guild.upsert({
      where: { id },
      create: { id, customCommandPrefix: body.data.prefix },
      update: { customCommandPrefix: body.data.prefix },
    });

    notifyGuildSettingsChanged(id).catch((error) => {
      console.warn(`Failed to notify prefix change (guild ${id}):`, error);
    });

    return NextResponse.json(await readCustomCommandsState(id));
  } catch (error) {
    console.error("Failed to update command prefix:", error);
    return NextResponse.json(
      { error: "요청을 처리하지 못했어요." },
      { status: 500 },
    );
  }
}
