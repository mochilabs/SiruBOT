import { NextResponse } from "next/server";
import type { Guild as PrismaGuild } from "@sirubot/prisma";
import { normalizeChatToolMode, normalizeEmbedFixSites, normalizeEmbedFixTranslateLang } from "@sirubot/utils/chatTools";

import { createGuildApiHandler } from "@/lib/api-handler";
import { notifyGuildSettingsChanged } from "@/lib/data-api/client";
import { db } from "@/lib/db";
import { READ_RATE, WRITE_RATE } from "@/lib/rate-limit";
import {
  GUILD_SETTING_KEYS,
  GUILD_SETTINGS_DEFAULTS,
  guildSettingsSchema,
  normalizeSponsorBlockSegments,
  parseSettingBody,
} from "@/lib/schemas";
import type { GuildSettings } from "@/types/settings";

/** DB 행이 없어도 기본값을 내려주는 응답 빌더 — 기본값 단일 소스는 GUILD_SETTINGS_DEFAULTS (스키마·Prisma @default와 동일성 검증은 schemas.test.ts) */
function toSettings(guild: PrismaGuild | null): GuildSettings {
  if (!guild) {
    return GUILD_SETTINGS_DEFAULTS;
  }
  return {
    volume: guild.volume,
    repeat: (["off", "track", "queue"].includes(guild.repeat)
      ? guild.repeat
      : "off") as GuildSettings["repeat"],
    related: guild.related,
    enableController: guild.enableController,
    sponsorBlockSegments: normalizeSponsorBlockSegments(guild.sponsorBlockSegments),
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
    normalizationEnabled: guild.normalizationEnabled,
    ttsParallelEnabled: guild.ttsParallelEnabled,
    emojiEnlargeMode: normalizeChatToolMode(guild.emojiEnlargeMode),
    emojiEnlargeChannelIds: guild.emojiEnlargeChannelIds,
    quoteMode: normalizeChatToolMode(guild.quoteMode),
    quoteChannelIds: guild.quoteChannelIds,
    embedFixMode: normalizeChatToolMode(guild.embedFixMode),
    embedFixChannelIds: guild.embedFixChannelIds,
    embedFixSites: normalizeEmbedFixSites(guild.embedFixSites),
    embedFixSuppressOriginal: guild.embedFixSuppressOriginal,
    embedFixTranslateLang: normalizeEmbedFixTranslateLang(guild.embedFixTranslateLang),
    countingEnabled: guild.countingEnabled,
    countingChannelId: guild.countingChannelId,
  };
}

export const GET = createGuildApiHandler({
  role: "manage",
  rate: READ_RATE,
  key: "settings-get",
  handler: async ({ guildId }) => {
    try {
      const guild = await db.guild.findUnique({ where: { id: guildId } });
      return NextResponse.json(toSettings(guild));
    } catch (error) {
      console.error("Failed to load guild settings:", error);
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
  key: "settings-put",
  handler: async ({ guildId, request }) => {
    try {
      const body = await parseSettingBody(request, guildSettingsSchema, GUILD_SETTING_KEYS);
      if (!body.ok) return body.response;

      const data = body.data;
      if (Object.keys(data).length > 0) {
        await db.guild.upsert({
          where: { id: guildId },
          create: { id: guildId, ...data },
          update: data,
        });
      }

      const guild = await db.guild.findUnique({ where: { id: guildId } });

      // 저장 성공 후 모든 봇 프로세스의 설정 캐시를 무효화해요 (fire-and-forget).
      // 실패해도 봇은 60초 TTL 폴백으로 결국 최신 설정을 읽으므로 응답을 막지 않아요.
      // 믹서(갭리스·크로스페이드) 저장이면 reason을 실어 봇이 재생 중인 플레이어에 바로 적용하게 해요.
      const touchesMixer = ["gaplessEnabled", "crossfadeEnabled", "crossfadeMs", "normalizationEnabled"].some((key) => key in data);
      notifyGuildSettingsChanged(guildId, touchesMixer ? "mixer" : undefined).catch((error) => {
        console.warn(`Failed to notify guild settings change (guild ${guildId}):`, error);
      });

      return NextResponse.json(toSettings(guild));
    } catch (error) {
      console.error("Failed to update guild settings:", error);
      return NextResponse.json(
        { error: "요청을 처리하지 못했어요." },
        { status: 500 },
      );
    }
  },
});
