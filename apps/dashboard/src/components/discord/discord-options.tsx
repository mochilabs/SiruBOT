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

/**
 * Discord 엔티티(채널·역할) 선택지 빌더 — 모든 셀렉트가 같은 순서·같은 라벨·같은 아이콘을 써요.
 * 목록을 만드는 곳마다 각자 정렬하던 것을 여기로 모아 순서가 화면마다 갈리지 않게 했어요.
 */

/** 메시지를 주고받는 채널 — 대부분의 채널 선택이 이 목록을 써요 */
export const TEXT_CHANNEL_TYPES: readonly number[] = [
  ChannelTypeValue.GuildText,
  ChannelTypeValue.GuildAnnouncement,
];

/** 음성에 들어갈 수 있는 채널 */
export const VOICE_CHANNEL_TYPES: readonly number[] = [
  ChannelTypeValue.GuildVoice,
  ChannelTypeValue.GuildStageVoice,
];

/** 채널을 담는 카테고리 */
export const CATEGORY_CHANNEL_TYPES: readonly number[] = [ChannelTypeValue.GuildCategory];

/** 설정에서 고를 수 있는 모든 채널 */
export const ALL_CHANNEL_TYPES: readonly number[] = SELECTABLE_CHANNEL_TYPES;

/**
 * 자주 쓰는 채널 종류 묶음 — `ChannelSelect`의 `types`에 그대로 넘겨요.
 * 없는 조합이 필요하면 배열을 직접 만들면 돼요 (예: `[...CHANNEL_TYPE_GROUP.chat, ...CHANNEL_TYPE_GROUP.voice]`).
 */
export const CHANNEL_TYPE_GROUP = {
  /** 채팅 채널 (일반·공지) */
  chat: TEXT_CHANNEL_TYPES,
  /** 음성 채널 (음성·스테이지) */
  voice: VOICE_CHANNEL_TYPES,
  /** 카테고리 */
  category: CATEGORY_CHANNEL_TYPES,
  /** 전부 */
  all: ALL_CHANNEL_TYPES,
} as const;

/** 채널 종류 아이콘 — 목록과 선택값 표시가 같은 아이콘을 써요 */
export function channelIcon(type: number) {
  if (type === ChannelTypeValue.GuildVoice || type === ChannelTypeValue.GuildStageVoice) {
    return <Volume2 size={16} aria-hidden />;
  }
  if (type === ChannelTypeValue.GuildCategory) return <Folder size={16} aria-hidden />;
  return <Hash size={16} aria-hidden />;
}

export interface ChannelOptionConfig {
  /** 넣을 채널 종류 — 기본은 메시지를 받는 채널(일반·공지) */
  types?: readonly number[];
  /** 지정하면 맨 앞에 "선택 안 함" 항목을 넣어요 */
  noneLabel?: string;
  /**
   * 저장된 값 중 목록에 없는 것 — "삭제된 채널" 그룹으로 남겨 사용자가 제거할 수 있게 해요.
   * 지우지 않고 숨기면 저장된 값이 어디로 사라졌는지 알 수 없어요.
   */
  selectedIds?: readonly string[];
  /** 카테고리별 그룹 표시 — 카테고리 자체를 고르는 목록에서는 꺼요 */
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
  /** 지정하면 맨 앞에 "선택 안 함" 항목을 넣어요 */
  noneLabel?: string;
  /** 저장된 값 중 목록에 없는 것 — "삭제된 역할"로 남겨 제거할 수 있게 해요 */
  selectedIds?: readonly string[];
}

export function buildRoleOptions(
  roles: DiscordRoleSummary[] | null,
  config: RoleOptionConfig = {},
): SearchableOption[] {
  const { noneLabel, selectedIds = [] } = config;

  // 역할은 위에서 아래로(높은 position 먼저) — Discord 역할 목록과 같은 순서예요
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
