"use client";

import { Hash, ListChecks, Play } from "lucide-react";

import { ChannelSelect } from "@/components/discord/channel-select";
import { CHANNEL_TYPE_GROUP } from "@/components/discord/discord-options";
import { RoleSelect } from "@/components/discord/role-select";
import { Field } from "@/components/primitives/field";
import {
  type SearchableOption,
  SearchableSelect,
} from "@/components/servers/searchable-select";
import { Switch } from "@/components/ui/switch";
import { useGuildChannels, useGuildRoles } from "@/hooks/use-guild-settings";
import type { GuildSettings } from "@/types/settings";

import { SettingsPanel, useSettingsPanel } from "./settings-panel";
import { SettingsSection, SettingsToggleRow } from "./settings-section";
import { InfoBox, RetryLink, WarningBox } from "./settings-shared";

const PINNED_MODE_OPTIONS: SearchableOption[] = [
  {
    value: "play",
    label: "즉시 재생 (첫 결과 바로 재생)",
    icon: <Play size={16} aria-hidden />,
  },
  {
    value: "select",
    label: "선택 재생 (5개 중 선택)",
    icon: <ListChecks size={16} aria-hidden />,
  },
];

const NO_SELECTION = { value: "", label: "사용 안 함" };

interface ChannelForm {
  textChannelId: string | null;
  voiceChannelId: string | null;
  pinnedChannelId: string | null;
  pinnedChannelMode: GuildSettings["pinnedChannelMode"];
  pinnedChannelDeleteInput: boolean;
  djRoleId: string | null;
}

const toChannelForm = (settings: GuildSettings): ChannelForm => ({
  textChannelId: settings.textChannelId,
  voiceChannelId: settings.voiceChannelId,
  pinnedChannelId: settings.pinnedChannelId,
  pinnedChannelMode: settings.pinnedChannelMode,
  pinnedChannelDeleteInput: settings.pinnedChannelDeleteInput,
  djRoleId: settings.djRoleId,
});

function ChannelSettingsPanel({ guildId }: { guildId: string }) {
  const panel = useSettingsPanel(guildId, toChannelForm, "채널·권한 설정을 저장했어요.");
  const { patch, saving } = panel;
  const {
    channels,
    error: channelsError,
    reload: reloadChannels,
  } = useGuildChannels(guildId, true);
  const {
    roles,
    error: rolesError,
    reload: reloadRoles,
  } = useGuildRoles(guildId, true);

  const listUnavailable = channels === null;
  const nameOf = (id: string | null) => (id ? `#${channels?.find((channel) => channel.id === id)?.name ?? "알 수 없음"}` : "사용 안 함");

  return (
    <SettingsPanel
      panel={panel}
      icon={<Hash className="h-5 w-5" />}
      title="채널·권한 설정"
      description="기본 채널, 고정 채널 동작, DJ 역할을 관리해요."
      notice={
      <InfoBox>
          <p>
            채널·역할은 디스코드에서 삭제되면 자동으로 무시돼요. 목록이 비어
            있으면 새로고침해 주세요.
          </p>
        </InfoBox>
      }
    >
      {(form) => (
        <>
      {(channelsError || rolesError) && (
        <WarningBox>
          일부 목록을 불러오지 못했어요. (
          {channelsError?.message ?? rolesError?.message}){" "}
          <RetryLink
            onRetry={() => {
              reloadChannels();
              reloadRoles();
            }}
          />
        </WarningBox>
      )}

      <div>
        <SettingsSection title="기본 채널" summary={`텍스트 ${nameOf(form.textChannelId)} · 음성 ${nameOf(form.voiceChannelId)}`} defaultOpen>
        <Field
          label="기본 텍스트 채널"
          description="미설정이면 입력이 온 채널을 그대로 사용해요."
        >
          <ChannelSelect
            channels={channels}
            types={CHANNEL_TYPE_GROUP.chat}
            noneLabel={NO_SELECTION.label}
            value={form.textChannelId ?? ""}
            onChange={(value: string) => patch({ textChannelId: value || null })}
            placeholder="사용 안 함"
            disabled={saving || listUnavailable}
          />
        </Field>

        <Field
          label="기본 음성 채널"
          description="/재생 커맨드로 자동 입장하는 채널이에요."
        >
          <ChannelSelect
            channels={channels}
            types={CHANNEL_TYPE_GROUP.voice}
            noneLabel={NO_SELECTION.label}
            value={form.voiceChannelId ?? ""}
            onChange={(value: string) => patch({ voiceChannelId: value || null })}
            placeholder="사용 안 함"
            disabled={saving || listUnavailable}
          />
        </Field>
        </SettingsSection>

        <SettingsSection title="고정 채널" summary={form.pinnedChannelId ? nameOf(form.pinnedChannelId) : "사용 안 함"}>
      <Field
        label="고정 채널"
        description="이 채널에 입력한 텍스트를 검색어로 재생해요. 전체 채널에서 고정 채널을 하나만 지정할 수 있어요."
      >
        <ChannelSelect
          channels={channels}
          types={CHANNEL_TYPE_GROUP.chat}
          noneLabel={NO_SELECTION.label}
          value={form.pinnedChannelId ?? ""}
          onChange={(value: string) => patch({ pinnedChannelId: value || null })}
          placeholder="사용 안 함"
          disabled={saving || listUnavailable}
        />
      </Field>

      <Field
        label="고정 채널 입력 동작"
        description={
          form.pinnedChannelId ? undefined : "고정 채널을 지정하면 적용돼요."
        }
      >
        <SearchableSelect
          options={PINNED_MODE_OPTIONS}
          value={form.pinnedChannelMode}
          onChange={(value: string) =>
            patch({
              pinnedChannelMode: value as ChannelForm["pinnedChannelMode"],
            })
          }
          disabled={saving || !form.pinnedChannelId}
        />
      </Field>

      <SettingsToggleRow
          title="입력 메시지 자동 삭제"
          description="봇이 재생을 시작한 뒤 입력 메시지를 지워요. 봇에게 메시지 관리 권한이 필요해요."
          control={<Switch checked={form.pinnedChannelDeleteInput} onChange={(checked: boolean) => patch({ pinnedChannelDeleteInput: checked })} disabled={saving || !form.pinnedChannelId} aria-label="입력 메시지 자동 삭제" />}
        />

        </SettingsSection>

        <SettingsSection title="권한" summary={form.djRoleId ? `DJ ${roles?.find((role) => role.id === form.djRoleId)?.name ?? "알 수 없음"}` : "DJ 역할 없음"}>
      <Field
        label="DJ 역할"
        description="이 역할을 가진 멤버만 정지·스킵·볼륨 등 컨트롤 커맨드를 쓸 수 있어요. 관리자는 항상 가능해요."
      >
        <RoleSelect
          roles={roles}
          noneLabel={NO_SELECTION.label}
          value={form.djRoleId ?? ""}
          onChange={(value: string) => patch({ djRoleId: value || null })}
          placeholder="사용 안 함"
          disabled={saving}
        />
      </Field>

        </SettingsSection>
      </div>
        </>
      )}
    </SettingsPanel>
  );
}

export function ChannelSettings({ guildId }: { guildId: string }) {
  return <ChannelSettingsPanel guildId={guildId} />;
}
