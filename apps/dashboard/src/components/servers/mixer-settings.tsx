"use client";

import { isTransitionMode, TRANSITION_LABELS, TRANSITION_MODES, transitionFlags, transitionMode } from "@sirubot/utils/mixerTransition";
import { SlidersHorizontal } from "lucide-react";

import { Field } from "@/components/primitives/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import type { GuildSettings } from "@/types/settings";

import { MixerInfoTip } from "./mixer-info";
import { SettingsPanel, useSettingsPanel } from "./settings-panel";
import { SettingsSection, SettingsToggleRow } from "./settings-section";

interface MixerForm {
  volume: number;
  ttsVolume: number;
  ttsDuckLevel: number;
  gaplessEnabled: boolean;
  crossfadeEnabled: boolean;
  automixEnabled: boolean;
  automixMaxTempoChange: number;
  automixMinConfidence: number;
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
  volume: settings.volume,
  ttsVolume: settings.ttsVolume,
  ttsDuckLevel: settings.ttsDuckLevel,
  gaplessEnabled: settings.gaplessEnabled,
  crossfadeEnabled: settings.crossfadeEnabled,
  automixEnabled: settings.automixEnabled,
  automixMaxTempoChange: settings.automixMaxTempoChange,
  automixMinConfidence: settings.automixMinConfidence,
  crossfadeMs: settings.crossfadeMs,
  normalizationEnabled: settings.normalizationEnabled,
  ttsAnnounceMode: settings.ttsAnnounceMode,
});

function MixerSettingsPanel({ guildId }: { guildId: string }) {
  const panel = useSettingsPanel(guildId, toMixerForm, "오디오 엔진 설정을 저장했어요.", null);
  const { patch, saving } = panel;

  return (
    <SettingsPanel
      panel={panel}
      icon={<SlidersHorizontal className="h-5 w-5" />}
      title="오디오 엔진"
      description="갭리스 재생과 크로스페이드로 재생 끊김을 조정해요."
    >
      {(form) => {
        const mode = transitionMode(form);
        return (
          <>
        <SettingsSection
          title="곡 전환"
          summary={
            mode === "off" ? "끄기" : mode === "crossfade" ? `크로스페이드 · ${(form.crossfadeMs / 1000).toFixed(1)}초` : "AutoMix"
          }
          defaultOpen
        >
          <Field label="곡 전환 방식" description="끄기는 겹치기 없이, 크로스페이드는 고정 길이로, AutoMix는 분석에 맞춰 이어줘요.">
            <Select value={mode} disabled={saving}
              onValueChange={(value) => { if (isTransitionMode(value)) patch(transitionFlags(value)); }}>
              <SelectTrigger className="w-full" aria-label="곡 전환 방식"><SelectValue>{(value) => isTransitionMode(value) ? TRANSITION_LABELS[value] : "끄기"}</SelectValue></SelectTrigger>
              <SelectContent>{TRANSITION_MODES.map((item) => <SelectItem key={item} value={item}>{TRANSITION_LABELS[item]}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          {mode !== "off" && (
            <Field label="크로스페이드 길이" description="0.5초 ~ 15초. 길수록 두 곡이 더 오래 겹쳐요.">
              <Slider hideLabel
                value={form.crossfadeMs}
                onChange={(value) => patch({ crossfadeMs: value })}
                min={500}
                max={15000}
                step={100}
                label="겹치기 길이"
                showValue
                formatValue={(v) => `${(v / 1000).toFixed(1)}초`}
                disabled={saving}
              />
            </Field>
          )}
          {mode === "automix" && (
            <>
              <p className="text-xs text-muted-foreground sm:text-sm">
                AutoMix는 두 곡의 박자와 템포를 맞춰 이어요. 분석이 어렵거나 템포 차이가 크면 일반 크로스페이드로 전환해요.
              </p>
              <Field label="최대 템포 변경" description="0% ~ 12%. 다음 곡의 템포를 조절할 수 있는 범위예요.">
                <Slider hideLabel value={form.automixMaxTempoChange * 100}
                  onChange={(value) => patch({ automixMaxTempoChange: value / 100 })}
                  min={0} max={12} step={1} label="최대 템포 변경" showValue
                  formatValue={(value) => `${value.toFixed(0)}%`} disabled={saving} />
              </Field>
              <Field label="최소 분석 신뢰도" description="높일수록 박자가 확실한 곡에만 비트 맞춤을 적용해요.">
                <Slider hideLabel value={form.automixMinConfidence}
                  onChange={(value) => patch({ automixMinConfidence: value })}
                  min={0} max={1} step={0.05} label="최소 분석 신뢰도" showValue
                  formatValue={(value) => value.toFixed(2)} disabled={saving} />
              </Field>
            </>
          )}
        </SettingsSection>

        <SettingsSection
          title="볼륨"
          summary={`음악 ${form.volume}% · TTS ${form.ttsVolume}% · 덕킹 ${Math.round(form.ttsDuckLevel * 100)}%`}
        >
          <Field label="음악 볼륨" description="서버 기본 음악 볼륨이에요. 다음 곡부터 적용돼요.">
            <Slider hideLabel value={form.volume} onChange={(value) => patch({ volume: value })}
              min={0} max={150} label="음악 볼륨" showValue formatValue={(v) => `${v}%`} disabled={saving} />
          </Field>
          <Field label="TTS 볼륨" description="채팅 낭독과 안내 음성의 볼륨이에요.">
            <Slider hideLabel value={form.ttsVolume} onChange={(value) => patch({ ttsVolume: value })}
              min={0} max={150} label="TTS 볼륨" showValue formatValue={(v) => `${v}%`} disabled={saving} />
          </Field>
          <Field label="덕킹 볼륨" description="TTS가 나오는 동안 음악을 이 비율로 낮춰요. 100%면 낮추지 않아요.">
            <Slider hideLabel value={Math.round(form.ttsDuckLevel * 100)} onChange={(value) => patch({ ttsDuckLevel: value / 100 })}
              min={0} max={100} step={5} label="덕킹 볼륨" showValue formatValue={(v) => `${v}%`} disabled={saving} />
          </Field>
        </SettingsSection>

        <SettingsSection
          title="재생 품질"
          summary={`갭리스 ${form.gaplessEnabled ? "켬" : "끔"} · 정규화 ${form.normalizationEnabled ? "켬" : "끔"}`}
        >
          <SettingsToggleRow
            title="갭리스 재생"
            description="다음 곡을 미리 받아 재생 사이의 끊김을 없애요."
            extra={<MixerInfoTip kind="gapless" />}
            control={<Switch checked={form.gaplessEnabled} onChange={(checked) => patch({ gaplessEnabled: checked })} disabled={saving} aria-label="갭리스 재생" />}
          />
          <SettingsToggleRow
            title="볼륨 정규화"
            description="첫 곡 기준으로 다음 곡들의 볼륨을 자동으로 맞춰요."
            control={<Switch checked={form.normalizationEnabled} onChange={(checked) => patch({ normalizationEnabled: checked })} disabled={saving} aria-label="볼륨 정규화" />}
          />
        </SettingsSection>

        <SettingsSection title="TTS 믹싱" summary={ANNOUNCE_MODE_OPTIONS.find((option) => option.value === form.ttsAnnounceMode)?.label}>
          <Field
            label="음성 안내 방식"
            description={ANNOUNCE_MODE_OPTIONS.find((option) => option.value === form.ttsAnnounceMode)?.hint ?? ""}
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
        </SettingsSection>
                </>
        );
      }}
    </SettingsPanel>
  );
}

export function MixerSettings({ guildId }: { guildId: string }) {
  return <MixerSettingsPanel guildId={guildId} />;
}
