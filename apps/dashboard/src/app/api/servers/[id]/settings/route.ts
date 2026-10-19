import { NextResponse } from "next/server";
import { normalizeEmbedFixSites } from "@sirubot/utils/chatTools";

import { authorizeGuildManage, deniedGuildManage } from "@/lib/api-guards";
import { notifyGuildSettingsChanged } from "@/lib/data-api";
import { db } from "@/lib/db";
import { guardRateLimit, rateKey, WRITE_RATE } from "@/lib/rate-limit";
import { guildSettingsSchema, normalizeChatToolMode, parseSettingBody } from "@/lib/schemas";
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
  "pinnedChannelDeleteInput",
  "jtcEnabled",
  "jtcCategoryId",
  "jtcMarkerChannelId",
  "jtcTemplate",
  "jtcUserLimit",
  "gaplessEnabled",
  "crossfadeEnabled",
  "crossfadeMs",
  "emojiEnlargeMode",
  "emojiEnlargeChannelIds",
  "quoteMode",
  "quoteChannelIds",
  "embedFixMode",
  "embedFixChannelIds",
  "embedFixSites",
  "embedFixSuppressOriginal",
  "countingEnabled",
  "countingChannelId",
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
    pinnedChannelDeleteInput: boolean;
    jtcEnabled: boolean;
    jtcCategoryId: string | null;
    jtcMarkerChannelId: string | null;
    jtcTemplate: string;
    jtcUserLimit: number;
    gaplessEnabled: boolean;
    crossfadeEnabled: boolean;
    crossfadeMs: number;
    emojiEnlargeMode: string;
    emojiEnlargeChannelIds: string[];
    quoteMode: string;
    quoteChannelIds: string[];
    embedFixMode: string;
    embedFixChannelIds: string[];
    embedFixSites: string[];
    embedFixSuppressOriginal: boolean;
    countingEnabled: boolean;
    countingChannelId: string | null;
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
      pinnedChannelDeleteInput: false,
      jtcEnabled: false,
      jtcCategoryId: null,
      jtcMarkerChannelId: null,
      jtcTemplate: "{user}의 방",
      jtcUserLimit: 0,
      gaplessEnabled: true,
      crossfadeEnabled: true,
      crossfadeMs: 5000,
      emojiEnlargeMode: "off",
      emojiEnlargeChannelIds: [],
      quoteMode: "off",
      quoteChannelIds: [],
      embedFixMode: "off",
      embedFixChannelIds: [],
      embedFixSites: [],
      embedFixSuppressOriginal: false,
      countingEnabled: false,
      countingChannelId: null,
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
    pinnedChannelDeleteInput: guild.pinnedChannelDeleteInput,
    jtcEnabled: guild.jtcEnabled,
    jtcCategoryId: guild.jtcCategoryId,
    jtcMarkerChannelId: guild.jtcMarkerChannelId,
    jtcTemplate: guild.jtcTemplate,
    jtcUserLimit: guild.jtcUserLimit,
    gaplessEnabled: guild.gaplessEnabled,
    crossfadeEnabled: guild.crossfadeEnabled,
    crossfadeMs: guild.crossfadeMs,
    emojiEnlargeMode: normalizeChatToolMode(guild.emojiEnlargeMode),
    emojiEnlargeChannelIds: guild.emojiEnlargeChannelIds,
    quoteMode: normalizeChatToolMode(guild.quoteMode),
    quoteChannelIds: guild.quoteChannelIds,
    embedFixMode: normalizeChatToolMode(guild.embedFixMode),
    embedFixChannelIds: guild.embedFixChannelIds,
    embedFixSites: normalizeEmbedFixSites(guild.embedFixSites),
    embedFixSuppressOriginal: guild.embedFixSuppressOriginal,
    countingEnabled: guild.countingEnabled,
    countingChannelId: guild.countingChannelId,
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

  const limited = await guardRateLimit(
    rateKey("settings-put", authz.userId, id),
    WRITE_RATE,
  );
  if (limited) return limited;

  try {
    const body = await parseSettingBody(request, guildSettingsSchema, ALLOWED_KEYS);
    if (!body.ok) return body.response;

    const data = body.data;
    if (Object.keys(data).length > 0) {
      await db.guild.upsert({
        where: { id },
        create: { id, ...data },
        update: data,
      });
    }

    const guild = await db.guild.findUnique({ where: { id } });

    // 저장 성공 후 모든 봇 프로세스의 설정 캐시를 무효화해요 (fire-and-forget).
    // 실패해도 봇은 60초 TTL 폴백으로 결국 최신 설정을 읽으므로 응답을 막지 않아요.
    // 믹서(갭리스·크로스페이드) 저장이면 reason을 실어 봇이 재생 중인 플레이어에 바로 적용하게 해요.
    const touchesMixer = ["gaplessEnabled", "crossfadeEnabled", "crossfadeMs"].some((key) => key in data);
    notifyGuildSettingsChanged(id, touchesMixer ? "mixer" : undefined).catch((error) => {
      console.warn(`Failed to notify guild settings change (guild ${id}):`, error);
    });

    return NextResponse.json(toSettings(guild));
  } catch (error) {
    console.error("Failed to update guild settings:", error);
    return NextResponse.json(
      { error: "요청을 처리하지 못했어요." },
      { status: 500 },
    );
  }
}
