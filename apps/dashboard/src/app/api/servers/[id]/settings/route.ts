import { NextResponse } from "next/server";
import type { Guild as PrismaGuild } from "@sirubot/prisma";
import { normalizeChatToolMode, normalizeEmbedFixSites, normalizeEmbedFixTranslateLang } from "@sirubot/utils/chatTools";
import {
  normalizeRepeatMode,
  normalizeSponsorBlockSegments,
  normalizeTextChannelMode,
  normalizeThemePreset,
  normalizeTtsAnnounceMode,
} from "@sirubot/utils/guildSettingsContract";
import { sanitizeDisabledModules } from "@sirubot/utils/modules";

import { createGuildApiHandler } from "@/lib/api-handler";
import { notifyGuildSettingsChanged } from "@/lib/data-api/client";
import { db } from "@/lib/db";
import { MIXER_SETTING_KEYS, normalizeMixerToggles } from "@/lib/mixer-settings";
import { PANEL_SETTING_KEYS } from "@/lib/panel-settings";
import { READ_RATE, WRITE_RATE } from "@/lib/rate-limit";
import {
  GUILD_SETTING_KEYS,
  GUILD_SETTINGS_DEFAULTS,
  guildSettingsSchema,
  parseSettingBody,
} from "@/lib/schemas";
import type { GuildSettings } from "@/types/settings";

function toSettings(guild: PrismaGuild | null): GuildSettings {
  if (!guild) {
    return GUILD_SETTINGS_DEFAULTS;
  }
  return {
    volume: guild.volume,
    ttsVolume: guild.ttsVolume,
    ttsDuckLevel: guild.ttsDuckLevel,
    repeat: normalizeRepeatMode(guild.repeat),
    related: guild.related,
    enableController: guild.enableController,
    sponsorBlockSegments: normalizeSponsorBlockSegments(guild.sponsorBlockSegments),
    djRoleId: guild.djRoleId,
    textChannelId: guild.textChannelId,
    voiceChannelId: guild.voiceChannelId,
    textChannelInputPlay: guild.textChannelInputPlay,
    textChannelMode: normalizeTextChannelMode(guild.textChannelMode),
    textChannelDeleteInput: guild.textChannelDeleteInput,
    jtcEnabled: guild.jtcEnabled,
    jtcCategoryId: guild.jtcCategoryId,
    jtcMarkerChannelId: guild.jtcMarkerChannelId,
    jtcTemplate: guild.jtcTemplate,
    jtcUserLimit: guild.jtcUserLimit,
    gaplessEnabled: guild.gaplessEnabled,
    crossfadeEnabled: guild.crossfadeEnabled,
    automixEnabled: guild.automixEnabled,
    automixMaxTempoChange: guild.automixMaxTempoChange,
    automixMinConfidence: guild.automixMinConfidence,
    crossfadeMs: guild.crossfadeMs,
    normalizationEnabled: guild.normalizationEnabled,
    ttsAnnounceMode: normalizeTtsAnnounceMode(guild.ttsAnnounceMode),
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
    themePreset: normalizeThemePreset(guild.themePreset),
    disabledModules: sanitizeDisabledModules(guild.disabledModules),
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

      const data = normalizeMixerToggles(body.data);
      if (data.disabledModules) data.disabledModules = sanitizeDisabledModules(data.disabledModules);
      if (Object.keys(data).length > 0) {
        await db.guild.upsert({
          where: { id: guildId },
          create: { id: guildId, ...data },
          update: data,
        });
      }

      const guild = await db.guild.findUnique({ where: { id: guildId } });

      const touchesMixer = MIXER_SETTING_KEYS.some((key) => key in data);
      const touchesPanel = PANEL_SETTING_KEYS.some((key) => key in data);
      notifyGuildSettingsChanged(guildId, touchesMixer ? "mixer" : touchesPanel ? "panel" : undefined).catch((error) => {
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
