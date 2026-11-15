"use client";

import { useCallback, useState } from "react";
import { JTC_TEMPLATE_MAX_LENGTH, JTC_USER_LIMIT_RANGE } from "@sirubot/utils/guildSettingsContract";
import { Volume2 } from "lucide-react";

import { ChannelSelect } from "@/components/discord/channel-select";
import { CHANNEL_TYPE_GROUP } from "@/components/discord/discord-options";
import { Field } from "@/components/primitives/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { useGuildChannels } from "@/hooks/use-guild-settings";
import { toApiError } from "@/lib/api-error";
import { notifyApiError } from "@/lib/notify";
import type { GuildSettings } from "@/types/settings";

import { SettingsPanel, useSettingsPanel } from "./settings-panel";
import { SettingsSection, SettingsToggleRow } from "./settings-section";
import { ChannelListError, InfoBox } from "./settings-shared";

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

const DEFAULT_MARKER_NAME = "🔊 임시방 만들기";

function JtcSettingsPanel({ guildId }: { guildId: string }) {
  const toast = useToast();
  const panel = useSettingsPanel(guildId, toJtcForm, "임시 음성 설정을 저장했어요.");
  const { patch, commitExternal, saving } = panel;
  const {
    channels,
    error: channelsError,
    reload: reloadChannels,
  } = useGuildChannels(guildId, true);
  const [setupLoading, setSetupLoading] = useState(false);
  const [markerNameDraft, setMarkerNameDraft] = useState<string | null>(null);

  /** 카테고리 선택·마커 이름 변경 = 봇 마커 채널 준비 작업(디스코드 채널 생성/이동/이름 변경) */
  const runJtcSetup = useCallback(
    async (categoryId: string, markerChannelName?: string) => {
      const trimmedName = markerChannelName?.trim() || undefined;
      setSetupLoading(true);
      try {
        const res = await fetch(`/api/servers/${guildId}/jtc/setup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            categoryId,
            ...(trimmedName ? { markerChannelName: trimmedName } : {}),
          }),
        });
        if (!res.ok)
          throw await toApiError(res, "마커 채널을 준비하지 못했어요.");
        const data = (await res.json()) as {
          categoryId: string;
          markerChannelId: string;
        };
        // /jtc/setup은 서버가 즉시 DB에 저장하므로 baseline과 SWR 캐시도 함께 갱신해
        // SaveBar가 불필요하게 dirty로 뜨지 않게 해요.
        commitExternal({
          jtcCategoryId: data.categoryId,
          jtcMarkerChannelId: data.markerChannelId,
        });
        setMarkerNameDraft(null);
        void reloadChannels();
        toast.success(
          "마커 채널을 준비했어요.",
          trimmedName
            ? `해당 카테고리에 '${trimmedName}' 채널이 준비되었어요.`
            : "해당 카테고리에 '🔊 임시방 만들기' 채널이 생기거나 옮겨졌어요.",
        );
      } catch (err) {
        notifyApiError(err, "마커 채널을 준비하지 못했어요.");
      } finally {
        setSetupLoading(false);
      }
    },
    [guildId, commitExternal, reloadChannels, toast],
  );

  return (
    <SettingsPanel
      panel={{ ...panel, saving: saving || setupLoading }}
      icon={<Volume2 className="h-5 w-5" />}
      title="임시 음성 채널 (JTC)"
      description="마커 채널에 들어가면 방장 이름으로 개인 음성방을 만들어 줘요."
      notice={
        <InfoBox>
          <p>비어 있는 임시방은 30초 후 자동으로 삭제돼요.</p>
        </InfoBox>
      }
    >
      {(form) => {
        const currentMarkerName = channels?.find((channel) => channel.id === form.jtcMarkerChannelId)?.name;
        const markerName = currentMarkerName ?? form.jtcMarkerChannelId;
        const markerNameInput = markerNameDraft ?? currentMarkerName ?? DEFAULT_MARKER_NAME;
        const categoryName = channels?.find((channel) => channel.id === form.jtcCategoryId)?.name;
        const templatePreview = (form.jtcTemplate.trim() || "{user}의 방").replaceAll("{user}", "철수");
        return (
          <>
            {channelsError && <ChannelListError error={channelsError} onRetry={reloadChannels} />}

            <SettingsSection
              title="사용"
              summary={form.jtcEnabled ? `켬${categoryName ? ` · ${categoryName}` : ""}` : "끔"}
              defaultOpen
            >
              <SettingsToggleRow
                title="임시 음성 채널 사용"
                description={form.jtcMarkerChannelId ? "마커 채널에 들어온 멤버에게 개인 음성방을 만들어 줘요." : "먼저 아래에서 카테고리를 설정해 주세요."}
                control={
                  <Switch
                    checked={form.jtcEnabled}
                    onChange={(checked: boolean) => patch({ jtcEnabled: checked })}
                    disabled={saving || !form.jtcMarkerChannelId}
                    aria-label="임시 음성 채널 사용"
                  />
                }
              />
              <Field
                label="생성 위치 (카테고리)"
                description="선택하면 해당 카테고리에 마커 채널이 만들어지거나 옮겨져요. (채널 관리 권한이 필요해요)"
              >
                <ChannelSelect
                  channels={channels}
                  types={CHANNEL_TYPE_GROUP.category}
                  groupByCategory={false}
                  value={form.jtcCategoryId ?? ""}
                  onChange={(value: string) => void runJtcSetup(value, markerNameInput)}
                  placeholder="카테고리 선택"
                  disabled={saving || setupLoading}
                />
              </Field>
              {form.jtcCategoryId && (
                <Field
                  label="마커 채널 이름"
                  description="멤버가 들어와서 임시방을 만드는 기준 음성 채널의 이름이에요."
                >
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      value={markerNameInput}
                      onChange={(e) => setMarkerNameDraft(e.target.value)}
                      maxLength={100}
                      placeholder={DEFAULT_MARKER_NAME}
                      disabled={saving || setupLoading}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      className="shrink-0"
                      loading={setupLoading}
                      disabled={saving || setupLoading || !markerNameInput.trim() || markerNameInput.trim() === currentMarkerName}
                      onClick={() => void runJtcSetup(form.jtcCategoryId!, markerNameInput)}
                    >
                      이름 적용
                    </Button>
                  </div>
                </Field>
              )}
              {form.jtcMarkerChannelId && (
                <InfoBox>
                  <p>
                    마커 채널: <span className="font-semibold text-foreground">{markerName}</span>. 멤버가 이 채널에 들어가면 임시방이 생겨요. 채널을 삭제해도 다음 설정 시 다시 만들어져요.
                  </p>
                  <p>마커 채널을 아예 제거하려면 Discord 서버에서 해당 채널을 삭제해 주세요.</p>
                </InfoBox>
              )}
            </SettingsSection>

            <SettingsSection title="방 설정" summary={`${templatePreview} · ${form.jtcUserLimit === 0 ? "인원 제한 없음" : `${form.jtcUserLimit}명`}`}>
              <Field htmlFor="jtc-template" label="방 이름 템플릿" description="{user}는 들어온 멤버의 이름으로 바뀌어요.">
                <Input
                  id="jtc-template"
                  type="text"
                  value={form.jtcTemplate}
                  maxLength={JTC_TEMPLATE_MAX_LENGTH}
                  disabled={saving}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ jtcTemplate: e.target.value })}
                  placeholder="{user}의 방"
                />
                <p className="pt-1 text-xs text-muted-foreground">
                  예시: <span className="font-semibold text-foreground">{templatePreview}</span>
                </p>
              </Field>
              <Field label="인원 제한">
                <Slider
                  hideLabel
                  value={form.jtcUserLimit}
                  onChange={(value: number) => patch({ jtcUserLimit: value })}
                  min={0}
                  max={JTC_USER_LIMIT_RANGE.max}
                  label="임시방 인원 제한"
                  formatValue={(v) => (v === 0 ? "제한 없음" : `${v}명`)}
                  disabled={saving}
                />
              </Field>
            </SettingsSection>
          </>
        );
      }}
    </SettingsPanel>
  );
}

export function JtcSettings({ guildId }: { guildId: string }) {
  return <JtcSettingsPanel guildId={guildId} />;
}
