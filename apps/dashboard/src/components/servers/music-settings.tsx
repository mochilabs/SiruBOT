"use client";

import { SPONSORBLOCK_SEGMENTS, type SponsorBlockSegment } from "@sirubot/utils/guildSettingsContract";
import {
  CircleDollarSign,
  Eye,
  FastForward,
  Film,
  Megaphone,
  MessageCircle,
  Music,
  Music2,
  Repeat,
  Repeat1,
  Repeat2,
  SkipForward,
} from "lucide-react";

import { Field } from "@/components/primitives/field";
import {
  type SearchableOption,
  SearchableSelect,
} from "@/components/servers/searchable-select";
import { Switch } from "@/components/ui/switch";
import type { GuildSettings } from "@/types/settings";

import { SettingsPanel, useSettingsPanel } from "./settings-panel";
import { SettingsSection, SettingsToggleRow } from "./settings-section";
import { InfoBox } from "./settings-shared";

const REPEAT_OPTIONS: SearchableOption[] = [
  { value: "off", label: "반복 없음", icon: <Repeat size={16} aria-hidden /> },
  {
    value: "track",
    label: "한 곡 반복",
    icon: <Repeat1 size={16} aria-hidden />,
  },
  {
    value: "queue",
    label: "전체 반복",
    icon: <Repeat2 size={16} aria-hidden />,
  },
];

const SEGMENT_OPTIONS_META: Record<
  SponsorBlockSegment,
  { label: string; icon: React.ReactNode }
> = {
  sponsor: {
    label: "스폰서",
    icon: <CircleDollarSign size={16} aria-hidden />,
  },
  selfpromo: { label: "자기 홍보", icon: <Megaphone size={16} aria-hidden /> },
  interaction: {
    label: "상호작용",
    icon: <MessageCircle size={16} aria-hidden />,
  },
  intro: { label: "인트로", icon: <Film size={16} aria-hidden /> },
  outro: { label: "아웃트로", icon: <SkipForward size={16} aria-hidden /> },
  preview: { label: "미리보기", icon: <Eye size={16} aria-hidden /> },
  music_offtopic: {
    label: "음악 외 구간",
    icon: <Music2 size={16} aria-hidden />,
  },
  filler: { label: "필러", icon: <FastForward size={16} aria-hidden /> },
};

const SEGMENT_OPTIONS: SearchableOption[] = SPONSORBLOCK_SEGMENTS.map(
  (segment) => ({ value: segment, ...SEGMENT_OPTIONS_META[segment] }),
);

interface MusicForm {
  volume: number;
  repeat: GuildSettings["repeat"];
  related: boolean;
  enableController: boolean;
  sponsorBlockSegments: GuildSettings["sponsorBlockSegments"];
}

const toMusicForm = (settings: GuildSettings): MusicForm => ({
  volume: settings.volume,
  repeat: settings.repeat,
  related: settings.related,
  enableController: settings.enableController,
  sponsorBlockSegments: settings.sponsorBlockSegments,
});

function MusicSettingsPanel({ guildId }: { guildId: string }) {
  const panel = useSettingsPanel(guildId, toMusicForm, "음악 설정을 저장했어요.");
  const { patch, saving } = panel;

  return (
    <SettingsPanel
      panel={panel}
      icon={<Music className="h-5 w-5" />}
      title="음악 설정"
      description="반복·관련곡·SponsorBlock을 관리해요. 볼륨은 오디오 엔진 탭에서 바꿔요."
      notice={
        <InfoBox>
          <p>변경 사항은 다음 곡부터 적용돼요. 지금 재생 중인 곡의 볼륨은 /볼륨 커맨드로 바로 바꿀 수 있어요.</p>
        </InfoBox>
      }
    >
      {(form) => (
        <>
          <SettingsSection
            title="재생"
            summary={REPEAT_OPTIONS.find((option) => option.value === form.repeat)?.label ?? form.repeat}
            defaultOpen
          >
            <Field label="반복 모드">
              <SearchableSelect
                options={REPEAT_OPTIONS}
                value={form.repeat}
                onChange={(value: string) => patch({ repeat: value as MusicForm["repeat"] })}
                disabled={saving}
              />
            </Field>
            <SettingsToggleRow
              title="재생 컨트롤러 메시지"
              description="재생 중에 컨트롤러 메시지를 띄워요."
              control={<Switch checked={form.enableController} onChange={(checked: boolean) => patch({ enableController: checked })} disabled={saving} aria-label="재생 컨트롤러 메시지" />}
            />
            <SettingsToggleRow
              title="관련곡 자동 추천"
              description="대기열이 끝나면 비슷한 곡을 이어서 재생해요."
              control={<Switch checked={form.related} onChange={(checked: boolean) => patch({ related: checked })} disabled={saving} aria-label="관련곡 자동 추천" />}
            />
          </SettingsSection>

          <SettingsSection title="SponsorBlock" summary={form.sponsorBlockSegments.length > 0 ? `${form.sponsorBlockSegments.length}개 구간` : "사용 안 함"}>
            <Field
              label="건너뛸 구간"
              description="YouTube 영상에서 선택한 구간을 자동으로 건너뛰어요. 재생 중인 곡에는 다음 곡부터 반영돼요."
            >
              <SearchableSelect
                multiple
                options={SEGMENT_OPTIONS}
                value={form.sponsorBlockSegments}
                onChange={(value: string[]) => patch({ sponsorBlockSegments: value as MusicForm["sponsorBlockSegments"] })}
                placeholder="구간을 선택하지 않으면 건너뛰지 않아요"
                disabled={saving}
              />
            </Field>
          </SettingsSection>
        </>
      )}
    </SettingsPanel>
  );
}

export function MusicSettings({ guildId }: { guildId: string }) {
  return <MusicSettingsPanel guildId={guildId} />;
}
