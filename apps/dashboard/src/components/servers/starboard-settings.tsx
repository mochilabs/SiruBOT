"use client";

import { useCallback, useEffect, useState } from "react";
import {
  STARBOARD_DEFAULT_EMOJI,
  STARBOARD_IGNORED_CHANNELS_MAX,
  STARBOARD_SETTINGS_DEFAULTS,
  STARBOARD_THRESHOLD_MAX,
  STARBOARD_THRESHOLD_MIN,
  type StarboardSettings,
} from "@sirubot/utils/starboard";
import { Star } from "lucide-react";
import useSWR from "swr";

import { ChannelSelect } from "@/components/discord/channel-select";
import { CHANNEL_TYPE_GROUP } from "@/components/discord/discord-options";
import { Field } from "@/components/primitives/field";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useGuildChannels } from "@/hooks/use-guild-settings";
import { toApiError, toError } from "@/lib/api-error";
import { notifyApiError, notifySaved } from "@/lib/notify";
import { createApiFetcher } from "@/lib/swr";

import { SettingsPanel } from "./settings-panel";
import { SettingsSection, SettingsToggleRow } from "./settings-section";
import { ChannelListError, InfoBox, WarningBox } from "./settings-shared";

const starboardFetcher = createApiFetcher<StarboardSettings>(
  "스타보드 설정을 불러오지 못했어요.",
  { sessionRetry: true },
);

export function StarboardSettings({ guildId }: { guildId: string }) {
  const url = `/api/servers/${guildId}/starboard`;
  const { data, error, isLoading, mutate } = useSWR<StarboardSettings>(
    url,
    starboardFetcher,
  );
  const {
    channels,
    error: channelsError,
    reload: reloadChannels,
  } = useGuildChannels(guildId, true);

  const [form, setForm] = useState<StarboardSettings>(STARBOARD_SETTINGS_DEFAULTS);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data && !dirty) setForm(data);
  }, [data, dirty]);

  const patch = useCallback((partial: Partial<StarboardSettings>) => {
    setDirty(true);
    setForm((prev) => ({ ...prev, ...partial }));
  }, []);

  const handleSave = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    try {
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw await toApiError(res, "스타보드 설정을 저장하지 못했어요.");
      const updated = (await res.json()) as StarboardSettings;
      setDirty(false);
      setForm(updated);
      await mutate(updated, { revalidate: false });
      notifySaved("스타보드 설정을 저장했어요.");
      return true;
    } catch (err) {
      notifyApiError(err, "저장에 실패했어요.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [url, form, mutate]);

  const panel = {
    form: isLoading ? null : form,
    isLoading,
    error: error ? toError(error, "스타보드 설정을 불러오지 못했어요.") : null,
    dirty,
    saving,
    handleSave,
    reload: () => void mutate(),
  };

  return (
    <SettingsPanel
      panel={panel}
      icon={<Star className="h-5 w-5" />}
      title="스타보드"
      description="반응이 많이 달린 메시지를 스타보드 채널에 모아 보여줘요."
      notice={
        <InfoBox>
          <p>
            한 번 올라간 글은 별 수가 기준 아래로 줄어도 지워지지 않고 수만 바뀌어요. 원문이 지워지면 스타보드 글도 함께 지워져요.
          </p>
          <p>봇에게 스타보드 채널의 메시지 보내기·읽기 권한이 필요해요.</p>
        </InfoBox>
      }
    >
      {(current) => (
        <>
          <SettingsSection title="기본" summary={current.channelId ? "켬" : "끔"} defaultOpen>
            <Field
              label="스타보드 채널"
              description="글이 올라갈 채널이에요. 비워 두면 스타보드가 꺼져요."
            >
              {channelsError ? (
                <ChannelListError error={channelsError} onRetry={reloadChannels} />
              ) : (
                <ChannelSelect
                  channels={channels}
                  value={current.channelId ?? ""}
                  onChange={(value) => patch({ channelId: value || null })}
                  types={CHANNEL_TYPE_GROUP.chat}
                  noneLabel="사용 안 함"
                  disabled={saving}
                  placeholder="채널을 선택해 주세요"
                />
              )}
            </Field>

            <Field
              label="이모지"
              description={`이 이모지가 달린 수를 세요. 서버 커스텀 이모지는 <:이름:ID> 형식으로 붙여넣어 쓸 수 있어요. 기본은 ${STARBOARD_DEFAULT_EMOJI}예요.`}
            >
              <EmojiPicker
                value={current.emoji}
                onChange={(emoji) => patch({ emoji: emoji ?? STARBOARD_DEFAULT_EMOJI })}
                required
                disabled={saving}
              />
            </Field>

            <Field
              label="기준 수"
              description="이 수 이상 달리면 스타보드에 올려요."
            >
              <Slider
                hideLabel
                value={current.threshold}
                onChange={(value) => patch({ threshold: value })}
                min={STARBOARD_THRESHOLD_MIN}
                max={STARBOARD_THRESHOLD_MAX}
                step={1}
                formatValue={(value) => `${value}개`}
                disabled={saving}
              />
            </Field>
          </SettingsSection>

          <SettingsSection
            title="제외 규칙"
            summary={`${current.excludeSelf ? "본인 제외" : "본인 포함"} · 무시 ${current.ignoredChannelIds.length}개`}
          >
            <SettingsToggleRow
              title="본인 반응 제외"
              description="글쓴이가 자기 메시지에 단 반응은 세지 않아요."
              control={
                <Switch
                  checked={current.excludeSelf}
                  onChange={(checked: boolean) => patch({ excludeSelf: checked })}
                  disabled={saving}
                  aria-label="본인 반응 제외"
                />
              }
            />
            <SettingsToggleRow
              title="NSFW 채널 제외"
              description="연령 제한 채널의 메시지는 올리지 않아요."
              control={
                <Switch
                  checked={current.excludeNsfw}
                  onChange={(checked: boolean) => patch({ excludeNsfw: checked })}
                  disabled={saving}
                  aria-label="NSFW 채널 제외"
                />
              }
            />
            <Field
              label="무시할 채널"
              description={`선택한 채널의 메시지는 스타보드 대상이 아니에요. 최대 ${STARBOARD_IGNORED_CHANNELS_MAX}개까지 고를 수 있어요.`}
            >
              {channelsError ? (
                <ChannelListError error={channelsError} onRetry={reloadChannels} />
              ) : (
                <ChannelSelect
                  multiple
                  channels={channels}
                  types={CHANNEL_TYPE_GROUP.chat}
                  searchPlaceholder="채널 검색…"
                  placeholder="채널을 선택해 주세요"
                  value={current.ignoredChannelIds}
                  onChange={(ids) => patch({ ignoredChannelIds: ids.slice(0, STARBOARD_IGNORED_CHANNELS_MAX) })}
                  disabled={saving}
                />
              )}
            </Field>
            {current.ignoredChannelIds.length >= STARBOARD_IGNORED_CHANNELS_MAX && (
              <WarningBox>무시할 채널은 최대 {STARBOARD_IGNORED_CHANNELS_MAX}개예요.</WarningBox>
            )}
          </SettingsSection>
        </>
      )}
    </SettingsPanel>
  );
}
