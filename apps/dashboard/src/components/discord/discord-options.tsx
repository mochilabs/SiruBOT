"use client";

import { Folder, Hash, Volume2 } from "lucide-react";

import type { SearchableOption } from "@/components/servers/searchable-select";
import { sortChannelsForDisplay } from "@/lib/channel-order";
import {
  ChannelTypeValue,
  type DiscordChannelSummary,
  type DiscordRoleSummary,
  SELECTABLE_CHANNEL_TYPES,
} from "@/types/discord";

export const TEXT_CHANNEL_TYPES: readonly number[] = [
  ChannelTypeValue.GuildText,
  ChannelTypeValue.GuildAnnouncement,
];

export const VOICE_CHANNEL_TYPES: readonly number[] = [
  ChannelTypeValue.GuildVoice,
  ChannelTypeValue.GuildStageVoice,
];

export const CATEGORY_CHANNEL_TYPES: readonly number[] = [ChannelTypeValue.GuildCategory];

export const ALL_CHANNEL_TYPES: readonly number[] = SELECTABLE_CHANNEL_TYPES;

export const CHANNEL_TYPE_GROUP = {
  chat: TEXT_CHANNEL_TYPES,
  voice: VOICE_CHANNEL_TYPES,
  category: CATEGORY_CHANNEL_TYPES,
  all: ALL_CHANNEL_TYPES,
} as const;

export function channelIcon(type: number) {
  if (type === ChannelTypeValue.GuildVoice || type === ChannelTypeValue.GuildStageVoice) {
    return <Volume2 size={16} aria-hidden />;
  }
  if (type === ChannelTypeValue.GuildCategory) return <Folder size={16} aria-hidden />;
  return <Hash size={16} aria-hidden />;
}

export interface ChannelOptionConfig {
  types?: readonly number[];
  noneLabel?: string;
  selectedIds?: readonly string[];
  groupByCategory?: boolean;
}

export function buildChannelOptions(
  channels: DiscordChannelSummary[] | null,
  config: ChannelOptionConfig = {},
): SearchableOption[] {
  const {
    types = TEXT_CHANNEL_TYPES,
    noneLabel,
    selectedIds = [],
    groupByCategory = true,
  } = config;

  const list = sortChannelsForDisplay(channels ?? []);
  const categories = new Map(
    list
      .filter((channel) => channel.type === ChannelTypeValue.GuildCategory)
      .map((channel) => [channel.id, channel.name]),
  );
  const allowed = new Set(types);

  const options: SearchableOption[] = list
    .filter((channel) => allowed.has(channel.type))
    .map((channel) => ({
      value: channel.id,
      label: channel.name,
      icon: channelIcon(channel.type),
      ...(groupByCategory
        ? {
            group: channel.parentId
              ? (categories.get(channel.parentId) ?? "카테고리 없음")
              : "카테고리 없음",
          }
        : {}),
    }));

  for (const id of selectedIds) {
    if (options.some((option) => option.value === id)) continue;
    options.push({ value: id, label: `${id} (삭제된 채널)`, group: "삭제된 채널" });
  }

  return noneLabel ? [{ value: "", label: noneLabel }, ...options] : options;
}

export interface RoleOptionConfig {
  noneLabel?: string;
  selectedIds?: readonly string[];
}

export function buildRoleOptions(
  roles: DiscordRoleSummary[] | null,
  config: RoleOptionConfig = {},
): SearchableOption[] {
  const { noneLabel, selectedIds = [] } = config;

  const options: SearchableOption[] = (roles ?? [])
    .slice()
    .sort((a, b) => b.position - a.position)
    .map((role) => ({
      value: role.id,
      label: role.name,
      icon: role.color ? (
        <span
          className="h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: role.color }}
        />
      ) : undefined,
    }));

  for (const id of selectedIds) {
    if (options.some((option) => option.value === id)) continue;
    options.push({ value: id, label: `${id} (삭제된 역할)` });
  }

  return noneLabel ? [{ value: "", label: noneLabel }, ...options] : options;
}
