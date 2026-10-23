"use client";

import { useCallback, useState } from "react";
import { Volume2 } from "lucide-react";

import { ChannelSelect } from "@/components/discord/channel-select";
import { CHANNEL_TYPE_GROUP } from "@/components/discord/discord-options";
import { Field } from "@/components/primitives/field";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { useGuildChannels, useSettingsForm } from "@/hooks/use-guild-settings";
import { toApiError } from "@/lib/api-error";
import { notifyApiError, notifySaved } from "@/lib/notify";
import type { GuildSettings } from "@/types/settings";

import {
  ChannelListError,
  InfoBox,
  PanelError,
  PanelHeader,
  PanelLoading,
  SaveBar,
} from "./settings-shared";

interface JtcForm {
  jtcEnabled: boolean;
  jtcCategoryId: string | null;
  jtcMarkerChannelId: string | null;
  jtcTemplate: string;
  jtcUserLimit: number;
}

const toJtcForm = (settings: GuildSettings): JtcForm => ({
  jtcEnabled: settings.jtcEnabled,
  jtcCategoryId: settings.jtcCategoryId,
  jtcMarkerChannelId: settings.jtcMarkerChannelId,
  jtcTemplate: settings.jtcTemplate,
  jtcUserLimit: settings.jtcUserLimit,
});

function JtcSettingsPanel({ guildId }: { guildId: string }) {
  const toast = useToast();
  const { form, isLoading, error, saving, dirty, patch, submit, reload } =
    useSettingsForm(guildId, toJtcForm);
  const {
    channels,
    error: channelsError,
    reload: reloadChannels,
  } = useGuildChannels(guildId, true);
  const [setupLoading, setSetupLoading] = useState(false);

  const handleSave = useCallback(async () => {
    try {
      await submit();
      notifySaved("임시 음성 설정을 저장했어요.");
    } catch (err) {
      notifyApiError(err, "저장에 실패했어요.");
    }
  }, [submit]);

  /** 카테고리 선택 = 봇과 같은 마커 채널 준비 작업(디스코드 채널 생성/이동) */
  const handleCategoryChange = useCallback(
    async (categoryId: string) => {
      setSetupLoading(true);
      try {
        const res = await fetch(`/api/servers/${guildId}/jtc/setup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ categoryId }),
        });
        if (!res.ok)
          throw await toApiError(res, "마커 채널을 준비하지 못했어요.");
        const data = (await res.json()) as {
          categoryId: string;
          markerChannelId: string;
        };
        patch({
          jtcCategoryId: data.categoryId,
          jtcMarkerChannelId: data.markerChannelId,
        });
        toast.success(
          "마커 채널을 준비했어요.",
          "해당 카테고리에 '🔊 임시방 만들기' 채널이 생기거나 옮겨졌어요.",
        );
      } catch (err) {
        notifyApiError(err, "마커 채널을 준비하지 못했어요.");
      } finally {
        setSetupLoading(false);
      }
    },
    [guildId, patch, toast],
  );

  if (isLoading) return <PanelLoading label="임시 음성 설정 불러오는 중…" />;
  if (error) return <PanelError error={error} onRetry={reload} />;
  if (!form) return <PanelLoading label="임시 음성 설정 불러오는 중…" />;

  const markerName =
    channels?.find((channel) => channel.id === form.jtcMarkerChannelId)?.name ??
    form.jtcMarkerChannelId;
  const templatePreview = (form.jtcTemplate.trim() || "{user}의 방").replaceAll(
    "{user}",
    "철수",
  );

  return (
    <Card padding="lg" className="gap-6 border-0 overflow-visible">
      <PanelHeader
        icon={<Volume2 className="h-5 w-5" />}
        title="임시 음성 채널 (JTC)"
        description="마커 채널에 들어가면 방장 이름으로 개인 음성방을 만들어 줘요."
      />

      {channelsError && <ChannelListError error={channelsError} onRetry={reloadChannels} />}

      <div className="flex items-center justify-between gap-4">
        <Switch
          checked={form.jtcEnabled}
          onChange={(checked: boolean) => patch({ jtcEnabled: checked })}
          disabled={saving || !form.jtcMarkerChannelId}
          label="임시 음성 채널 사용"
          labelPosition="left"
        />
        {!form.jtcMarkerChannelId && (
          <span className="text-xs text-muted-foreground">
            먼저 아래에서 카테고리를 설정해 주세요.
          </span>
        )}
      </div>

      <Field
        label="생성 위치 (카테고리)"
        description={
          <>
            선택하면 바로 반영돼요:{" "}
            <code className="rounded-control bg-muted px-1.5 py-0.5 text-xs">
              🔊 임시방 만들기
            </code>{" "}
            마커 채널이 해당 카테고리로 만들어지거나 옮겨져요. (채널 관리 권한이
            필요해요)
          </>
        }
      >
        <ChannelSelect
          channels={channels}
          types={CHANNEL_TYPE_GROUP.category}
          groupByCategory={false}
          value={form.jtcCategoryId ?? ""}
          onChange={(value: string) => void handleCategoryChange(value)}
          placeholder="카테고리 선택"
          disabled={saving || setupLoading}
        />
      </Field>

      {form.jtcMarkerChannelId && (
        <InfoBox>
          <p>
            마커 채널:{" "}
            <span className="font-semibold text-foreground">{markerName}</span>.
            멤버가 이 채널에 들어가면 임시방이 생겨요. 채널을 삭제해도 다음 설정
            시 다시 만들어져요.
          </p>
          <p>
            마커 채널을 아예 제거하려면 Discord 서버에서 해당 채널을 삭제해
            주세요.
          </p>
        </InfoBox>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          htmlFor="jtc-template"
          label="방 이름 템플릿"
          description="{user}는 들어온 멤버의 이름으로 바뀌어요."
        >
          <Input
            id="jtc-template"
            type="text"
            value={form.jtcTemplate}
            maxLength={100}
            disabled={saving}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              patch({ jtcTemplate: e.target.value })
            }
            placeholder="{user}의 방"
          />
          <p className="pt-1 text-xs text-muted-foreground">
            예시:{" "}
            <span className="font-semibold text-foreground">
              {templatePreview}
            </span>
          </p>
        </Field>

        <Field label="인원 제한">
          <Slider
            value={form.jtcUserLimit}
            onChange={(value: number) => patch({ jtcUserLimit: value })}
            min={0}
            max={99}
            label="임시방 인원 제한"
            showValue
            formatValue={(v) => (v === 0 ? "제한 없음" : `${v}명`)}
            disabled={saving}
          />
        </Field>
      </div>

      <InfoBox>
        {/* 서버 운영용 환경변수명(JTC_EMPTY_GRACE_MS)은 사용자에게 보이지 않게 감춰요 */}
        <p>
          비어 있는 임시방은 30초 후 자동으로 삭제돼요. (서버 설정으로 조정할 수
          있어요)
        </p>
      </InfoBox>

      <SaveBar
        dirty={dirty}
        saving={saving || setupLoading}
        onSave={handleSave}
      />
    </Card>
  );
}

export function JtcSettings({ guildId }: { guildId: string }) {
  return <JtcSettingsPanel guildId={guildId} />;
}
