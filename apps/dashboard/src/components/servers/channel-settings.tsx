"use client";

import { useCallback } from "react";
import { Hash, ListChecks, Play } from "lucide-react";

import { ChannelSelect } from "@/components/discord/channel-select";
import { CHANNEL_TYPE_GROUP } from "@/components/discord/discord-options";
import { RoleSelect } from "@/components/discord/role-select";
import { Field } from "@/components/primitives/field";
import {
  type SearchableOption,
  SearchableSelect,
} from "@/components/servers/searchable-select";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  useGuildChannels,
  useGuildRoles,
  useSettingsForm,
} from "@/hooks/use-guild-settings";
import { notifyApiError, notifySaved } from "@/lib/notify";
import type { GuildSettings } from "@/types/settings";

import {
  InfoBox,
  PanelError,
  PanelHeader,
  PanelLoading,
  RetryLink,
  SaveBar,
  WarningBox,
} from "./settings-shared";

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
  const { form, isLoading, error, saving, dirty, patch, submit, reload } =
    useSettingsForm(guildId, toChannelForm);
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

  const handleSave = useCallback(async () => {
    try {
      await submit();
      notifySaved("채널·권한 설정을 저장했어요.");
    } catch (err) {
      notifyApiError(err, "저장에 실패했어요.");
    }
  }, [submit]);

  if (isLoading) return <PanelLoading label="채널·권한 설정 불러오는 중…" />;
  if (error) return <PanelError error={error} onRetry={reload} />;
  if (!form) return <PanelLoading label="채널·권한 설정 불러오는 중…" />;

  const listUnavailable = channels === null;

  return (
    <Card padding="lg" className="gap-6 border-0 overflow-visible">
      <PanelHeader
        icon={<Hash className="h-5 w-5" />}
        title="채널·권한 설정"
        description="기본 채널, 고정 채널 동작, DJ 역할을 관리해요."
      />

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

      <div className="grid gap-6 sm:grid-cols-2">
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
      </div>

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

      <Field
        label="입력 메시지 자동 삭제"
        description="봇이 재생을 시작한 뒤 입력 메시지를 지워요. 봇에게 메시지 관리 권한이 필요해요."
      >
        <Switch
          checked={form.pinnedChannelDeleteInput}
          onChange={(checked: boolean) =>
            patch({ pinnedChannelDeleteInput: checked })
          }
          disabled={saving || !form.pinnedChannelId}
        />
      </Field>

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

      <InfoBox>
        <p>
          채널·역할은 디스코드에서 삭제되면 자동으로 무시돼요. 목록이 비어
          있으면 새로고침해 주세요.
        </p>
      </InfoBox>

      <SaveBar dirty={dirty} saving={saving} onSave={handleSave} />
    </Card>
  );
}

export function ChannelSettings({ guildId }: { guildId: string }) {
  return <ChannelSettingsPanel guildId={guildId} />;
}
