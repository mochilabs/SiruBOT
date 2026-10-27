"use client";

import { useCallback } from "react";
import { SlidersHorizontal } from "lucide-react";

import { Field } from "@/components/primitives/field";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useSettingsForm } from "@/hooks/use-guild-settings";
import { notifyApiError, notifySaved } from "@/lib/notify";
import type { GuildSettings } from "@/types/settings";

import { MixerInfoTip } from "./mixer-info";
import { PanelError, PanelHeader, PanelLoading, SaveBar } from "./settings-shared";

interface MixerForm {
  gaplessEnabled: boolean;
  crossfadeEnabled: boolean;
  crossfadeMs: number;
  normalizationEnabled: boolean;
  ttsAnnounceMode: GuildSettings["ttsAnnounceMode"];
}

/** 안내 방식 3택 — 봇 `/믹서 안내방식`·`/설정 audio`와 같은 값이에요 */
const ANNOUNCE_MODE_OPTIONS = [
  { value: "sequential", label: "순서대로", hint: "안내가 끝나야 다음 안내가 시작돼요." },
  { value: "parallel", label: "겹쳐서", hint: "여러 안내를 동시에 재생해요." },
  { value: "interrupt", label: "최신 안내만", hint: "새 안내가 오면 대기 중인 안내를 버리고 최신 것만 읽어요." },
] as const;

const toMixerForm = (settings: GuildSettings): MixerForm => ({
  gaplessEnabled: settings.gaplessEnabled,
  crossfadeEnabled: settings.crossfadeEnabled,
  crossfadeMs: settings.crossfadeMs,
  normalizationEnabled: settings.normalizationEnabled,
  ttsAnnounceMode: settings.ttsAnnounceMode,
});

function MixerSettingsPanel({ guildId }: { guildId: string }) {
  const { form, isLoading, error, saving, dirty, patch, submit, reload } =
    useSettingsForm(guildId, toMixerForm);

	const handleSave = useCallback(async () => {
		try {
			await submit();
			notifySaved("오디오 엔진 설정을 저장했어요.", null);
		} catch (err) {
			notifyApiError(err, "저장에 실패했어요.");
		}
	}, [submit]);

  if (isLoading) return <PanelLoading label="오디오 엔진 설정 불러오는 중…" />;
  if (error) return <PanelError error={error} onRetry={reload} />;
  if (!form) return <PanelLoading label="오디오 엔진 설정 불러오는 중…" />;

  return (
    <Card padding="lg" className="gap-6 overflow-visible">
      <PanelHeader
        icon={<SlidersHorizontal className="h-5 w-5" />}
        title="오디오 엔진"
        description="갭리스 재생과 크로스페이드로 재생 끊김을 조정해요."
      />

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-4 rounded-card bg-surface-2 p-4">
          <div className="flex items-center justify-between gap-2">
            <Switch
              checked={form.gaplessEnabled}
              onChange={(checked) => patch({ gaplessEnabled: checked })}
              disabled={saving}
              label="갭리스 재생"
              labelPosition="left"
            />
            <MixerInfoTip kind="gapless" />
          </div>
          <p className="text-xs text-muted-foreground">
            다음 곡을 미리 받아 재생 사이의 끊김을 없애요.
          </p>
        </div>

        <div className="space-y-4 rounded-card bg-surface-2 p-4">
          <div className="flex items-center justify-between gap-2">
            <Switch
              checked={form.crossfadeEnabled}
              onChange={(checked) => patch({ crossfadeEnabled: checked })}
              disabled={saving}
              label="크로스페이드"
              labelPosition="left"
            />
            <MixerInfoTip kind="crossfade" />
          </div>
          <p className="text-xs text-muted-foreground">
            곡 끝과 다음 곡 시작을 겹쳐서 이어요.
          </p>
        </div>

        <div className="space-y-4 rounded-card bg-surface-2 p-4">
          <div className="flex items-center justify-between gap-2">
            <Switch
              checked={form.normalizationEnabled}
              onChange={(checked) => patch({ normalizationEnabled: checked })}
              disabled={saving}
              label="볼륨 정규화"
              labelPosition="left"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            첫 곡 기준으로 다음 곡들의 볼륨을 자동으로 맞춰요.
          </p>
        </div>

        <div className="space-y-4 rounded-card bg-surface-2 p-4">
          <Field
            label="음성 안내 방식"
            description={
              ANNOUNCE_MODE_OPTIONS.find((option) => option.value === form.ttsAnnounceMode)?.hint ?? ""
            }
          >
            <Select
              value={form.ttsAnnounceMode}
              onValueChange={(value) => {
                if (value) patch({ ttsAnnounceMode: value as GuildSettings["ttsAnnounceMode"] });
              }}
              disabled={saving}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(value: string) =>
                    ANNOUNCE_MODE_OPTIONS.find((option) => option.value === value)?.label ?? "순서대로"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ANNOUNCE_MODE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </div>

      <Field
        label="크로스페이드 길이"
        description="0.5초 ~ 15초. 길수록 두 곡이 더 오래 겹쳐요."
      >
        <Slider
          value={form.crossfadeMs}
          onChange={(value) => patch({ crossfadeMs: value })}
          min={500}
          max={15000}
          step={100}
          label="겹치기 길이"
          showValue
          formatValue={(v) => `${(v / 1000).toFixed(1)}초`}
          disabled={saving || !form.crossfadeEnabled}
        />
      </Field>

			<SaveBar dirty={dirty} saving={saving} onSave={handleSave} />
		</Card>
	);
}

export function MixerSettings({ guildId }: { guildId: string }) {
  return <MixerSettingsPanel guildId={guildId} />;
}
