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

const INPUT_MODE_OPTIONS: SearchableOption[] = [
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
  textChannelInputPlay: boolean;
  textChannelMode: GuildSettings["textChannelMode"];
  textChannelDeleteInput: boolean;
  djRoleId: string | null;
}

const toChannelForm = (settings: GuildSettings): ChannelForm => ({
  textChannelId: settings.textChannelId,
  voiceChannelId: settings.voiceChannelId,
  textChannelInputPlay: settings.textChannelInputPlay,
  textChannelMode: settings.textChannelMode,
  textChannelDeleteInput: settings.textChannelDeleteInput,
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
  // 목록이 아직 없으면(로딩·실패) "불러오는 중", 목록에 없는 id는 삭제된 채널로 구분해요
  const nameOf = (id: string | null) => {
    if (!id) return "사용 안 함";
    if (!channels) return "불러오는 중";
    const name = channels.find((channel) => channel.id === id)?.name;
    return name ? `#${name}` : "삭제된 채널";
  };
  const djRoleSummary = (id: string | null) => {
    if (!id) return "DJ 역할 없음";
    if (!roles) return "불러오는 중";
    const name = roles.find((role) => role.id === id)?.name;
    return name ? `DJ ${name}` : "삭제된 역할";
  };

  return (
    <SettingsPanel
      panel={panel}
      icon={<Hash className="h-5 w-5" />}
      title="채널·권한 설정"
      description="기본 채널(명령어 허용·고정 패널), 채팅 입력 재생, DJ 역할을 관리해요."
      notice={
        <InfoBox>
          <p>목록이 비어 있으면 새로고침해 주세요.</p>
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
          htmlFor="channel-default-text"
          label="기본 텍스트 채널"
          description="설정하면 이 채널에서만 명령어를 쓸 수 있고, 플레이어 패널이 메시지 1개로 고정돼요. 미설정이면 입력이 온 채널을 그대로 사용해요."
        >
          <ChannelSelect
            id="channel-default-text"
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
          htmlFor="channel-default-voice"
          label="기본 음성 채널"
          description="/재생 커맨드로 자동 입장하는 채널이에요."
        >
          <ChannelSelect
            id="channel-default-voice"
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

        <SettingsSection
          title="채팅 입력 재생"
          summary={form.textChannelId && form.textChannelInputPlay ? "켜짐" : "꺼짐"}
        >
      <SettingsToggleRow
          title="채팅 입력으로 재생"
          description="기본 텍스트 채널에 입력한 곡 제목·링크를 검색어로 재생해요. 기본 텍스트 채널을 지정하면 쓸 수 있어요."
          control={<Switch checked={form.textChannelInputPlay} onChange={(checked: boolean) => patch({ textChannelInputPlay: checked })} disabled={saving || !form.textChannelId} aria-label="채팅 입력으로 재생" />}
        />

      <Field
        htmlFor="channel-input-mode"
        label="입력 동작"
        description={
          form.textChannelId && form.textChannelInputPlay
            ? undefined
            : "채팅 입력 재생을 켜면 적용돼요."
        }
      >
        <SearchableSelect
          id="channel-input-mode"
          options={INPUT_MODE_OPTIONS}
          value={form.textChannelMode}
          onChange={(value: string) =>
            patch({
              textChannelMode: value as ChannelForm["textChannelMode"],
            })
          }
          disabled={saving || !form.textChannelId || !form.textChannelInputPlay}
        />
      </Field>

      <SettingsToggleRow
          title="입력 메시지 자동 삭제"
          description="봇이 재생을 시작한 뒤 입력 메시지를 지워요. 봇에게 메시지 관리 권한이 필요해요."
          control={<Switch checked={form.textChannelDeleteInput} onChange={(checked: boolean) => patch({ textChannelDeleteInput: checked })} disabled={saving || !form.textChannelId || !form.textChannelInputPlay} aria-label="입력 메시지 자동 삭제" />}
        />

        </SettingsSection>

        <SettingsSection title="권한" summary={djRoleSummary(form.djRoleId)}>
      <Field
        htmlFor="channel-dj-role"
        label="DJ 역할"
        description="이 역할을 가진 멤버만 정지·스킵·볼륨 등 컨트롤 커맨드를 쓸 수 있어요. 관리자는 항상 가능해요."
      >
        <RoleSelect
          id="channel-dj-role"
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
