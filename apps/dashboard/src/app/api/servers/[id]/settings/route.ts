import { NextResponse } from "next/server";

import { authorizeGuildManage, deniedGuildManage } from "@/lib/api-guards";
import { db } from "@/lib/db";
import { guardRateLimit, rateKey, WRITE_RATE } from "@/lib/rate-limit";
import { guildSettingsSchema, unknownKeys, zodError } from "@/lib/schemas";
import type { GuildSettings } from "@/types/settings";

const ALLOWED_KEYS = [
  "volume",
  "repeat",
  "related",
  "enableController",
  "sponsorBlockSegments",
  "djRoleId",
  "textChannelId",
  "voiceChannelId",
  "pinnedChannelId",
  "pinnedChannelMode",
  "jtcEnabled",
  "jtcCategoryId",
  "jtcMarkerChannelId",
  "jtcTemplate",
  "jtcUserLimit",
  "gaplessEnabled",
  "crossfadeEnabled",
  "crossfadeMs",
] as const;

/** DB 행이 없어도 기본값을 내려주는 응답 빌더 (봇 기본값과 동일해야 해요) */
function toSettings(
  guild: {
    volume: number;
    repeat: string;
    related: boolean;
    enableController: boolean;
    sponsorBlockSegments: string[];
    djRoleId: string | null;
    textChannelId: string | null;
    voiceChannelId: string | null;
    pinnedChannelId: string | null;
    pinnedChannelMode: string;
    jtcEnabled: boolean;
    jtcCategoryId: string | null;
    jtcMarkerChannelId: string | null;
    jtcTemplate: string;
    jtcUserLimit: number;
    gaplessEnabled: boolean;
    crossfadeEnabled: boolean;
    crossfadeMs: number;
  } | null,
): GuildSettings {
  if (!guild) {
    return {
      volume: 10,
      repeat: "off",
      related: false,
      enableController: true,
      sponsorBlockSegments: [],
      djRoleId: null,
      textChannelId: null,
      voiceChannelId: null,
      pinnedChannelId: null,
      pinnedChannelMode: "play",
      jtcEnabled: false,
      jtcCategoryId: null,
      jtcMarkerChannelId: null,
      jtcTemplate: "{user}의 방",
      jtcUserLimit: 0,
      gaplessEnabled: true,
      crossfadeEnabled: true,
      crossfadeMs: 5000,
    };
  }
  return {
    volume: guild.volume,
    repeat: (["off", "track", "queue"].includes(guild.repeat)
      ? guild.repeat
      : "off") as GuildSettings["repeat"],
    related: guild.related,
    enableController: guild.enableController,
    sponsorBlockSegments: guild.sponsorBlockSegments,
    djRoleId: guild.djRoleId,
    textChannelId: guild.textChannelId,
    voiceChannelId: guild.voiceChannelId,
    pinnedChannelId: guild.pinnedChannelId,
    pinnedChannelMode: (["play", "select"].includes(guild.pinnedChannelMode)
      ? guild.pinnedChannelMode
      : "play") as GuildSettings["pinnedChannelMode"],
    jtcEnabled: guild.jtcEnabled,
    jtcCategoryId: guild.jtcCategoryId,
    jtcMarkerChannelId: guild.jtcMarkerChannelId,
    jtcTemplate: guild.jtcTemplate,
    jtcUserLimit: guild.jtcUserLimit,
    gaplessEnabled: guild.gaplessEnabled,
    crossfadeEnabled: guild.crossfadeEnabled,
    crossfadeMs: guild.crossfadeMs,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authz = await authorizeGuildManage(id);
  if (!authz.ok) return deniedGuildManage(authz);
  try {
    const guild = await db.guild.findUnique({ where: { id } });
    return NextResponse.json(toSettings(guild));
  } catch (error) {
    console.error("Failed to load guild settings:", error);
    return NextResponse.json(
      { error: "요청을 처리하지 못했어요." },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authz = await authorizeGuildManage(id);
  if (!authz.ok) return deniedGuildManage(authz);

  const limited = guardRateLimit(
    rateKey("settings-put", authz.userId, id),
    WRITE_RATE,
  );
  if (limited) return limited;

  try {
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "잘못된 요청이에요." },
        { status: 400 },
      );
    }

    const unknown = unknownKeys(body, ALLOWED_KEYS);
    if (unknown.length > 0) {
      return NextResponse.json(
        { error: `지원하지 않는 필드예요: ${unknown.join(", ")}` },
        { status: 400 },
      );
    }

    const parsed = guildSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: zodError(parsed.error) },
        { status: 400 },
      );
    }

    const data = parsed.data;
    if (Object.keys(data).length > 0) {
      await db.guild.upsert({
        where: { id },
        create: { id, ...data },
        update: data,
      });
    }

    const guild = await db.guild.findUnique({ where: { id } });
    return NextResponse.json(toSettings(guild));
  } catch (error) {
    console.error("Failed to update guild settings:", error);
    return NextResponse.json(
      { error: "요청을 처리하지 못했어요." },
      { status: 500 },
    );
  }
}
