"use client";

import { useCallback } from "react";
import { SlidersHorizontal } from "lucide-react";

import { Field } from "@/components/primitives/field";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { useSettingsForm } from "@/hooks/use-guild-settings";
import { toError } from "@/lib/api-error";
import type { GuildSettings } from "@/types/settings";

import { MixerInfoTip } from "./mixer-info";
import { PanelError, PanelHeader, PanelLoading, SaveBar } from "./settings-shared";

interface MixerForm {
  gaplessEnabled: boolean;
  crossfadeEnabled: boolean;
  crossfadeMs: number;
}

const toMixerForm = (settings: GuildSettings): MixerForm => ({
  gaplessEnabled: settings.gaplessEnabled,
  crossfadeEnabled: settings.crossfadeEnabled,
  crossfadeMs: settings.crossfadeMs,
});

function MixerSettingsPanel({ guildId }: { guildId: string }) {
  const toast = useToast();
  const { form, isLoading, error, saving, dirty, patch, submit, reload } =
    useSettingsForm(guildId, toMixerForm);

	const handleSave = useCallback(async () => {
		try {
			await submit();
			toast.success("오디오 엔진 설정을 저장했어요.");
		} catch (err) {
			const apiError = toError(err, "저장에 실패했어요.");
			toast.error(apiError.message, apiError.retryable ? "잠시 후 다시 시도해 주세요." : undefined);
		}
	}, [submit, toast]);

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
      </div>

      <Field
        label="크로스페이드 길이"
        description="500ms ~ 30000ms. 길수록 두 곡이 더 오래 겹쳐요."
      >
        <Slider
          value={form.crossfadeMs}
          onChange={(value) => patch({ crossfadeMs: value })}
          min={500}
          max={30000}
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
