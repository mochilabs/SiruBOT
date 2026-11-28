"use client";

import { DEFAULT_CARD_CONFIGS, type GreetingCardKind } from "@sirubot/utils/birthdayCelebration";
import {
  GREETING_LAYOUTS,
  type GreetingConfig,
  type GreetingLayout,
} from "@sirubot/utils/memberGreeting";
import { RotateCcw } from "lucide-react";

import { ChannelSelect } from "@/components/discord/channel-select";
import { Field } from "@/components/primitives/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { COLOR_PRESETS,ColorPicker } from "@/components/ui/color-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TabsContent } from "@/components/ui/tabs";
import type { DiscordChannelSummary } from "@/types/discord";
import type { GreetingTestResult } from "@/types/member-greeting";

import { GreetingImageEditCard } from "./greeting-image-edit-card";
import { GreetingTemplateField } from "./greeting-template-field";
import { GreetingTestPanel } from "./greeting-test-panel";

const DEFAULT_ACCENT_COLOR_HEX = "#ffdaff";

const LAYOUT_LABELS: Record<GreetingLayout, string> = {
  container: "컨테이너",
  components: "컴포넌트 목록",
};

const SECTION_META: Record<
  GreetingCardKind,
  { heading: string; description: string; switchLabel: string }
> = {
  welcome: {
    heading: "환영",
    description: "멤버가 이 서버에 입장할 때 보내는 메시지예요.",
    switchLabel: "환영 메시지 보내기",
  },
  goodbye: {
    heading: "작별",
    description: "멤버가 이 서버에서 퇴장할 때 보내는 메시지예요.",
    switchLabel: "작별 메시지 보내기",
  },
  birthday: {
    heading: "생일 축하",
    description: "생일 축하를 켠 멤버를 정해진 시각에 카드와 함께 축하해요. 같은 날 생일이 여럿이면 카드 한 장에 모아요.",
    switchLabel: "생일 축하 보내기",
  },
};

interface GreetingSectionProps {
  asTabContent: string;
  guildId: string;
  visible: boolean;
  guildName: string | null;
  kind: GreetingCardKind;
  draft: GreetingConfig;
  saved: GreetingConfig;
  dirty: boolean;
  channels: DiscordChannelSummary[] | null;
  saving: boolean;
  testPending?: boolean;
  testResult?: GreetingTestResult | null;
  onPatch: (next: GreetingConfig) => void;
  onReset: () => void;
  onTest?: () => Promise<void>;
}

export function GreetingSection({
  asTabContent,
  guildId,
  visible,
  guildName,
  kind,
  draft,
  saved,
  dirty,
  channels,
  saving,
  testPending,
  testResult,
  onPatch,
  onReset,
  onTest,
}: GreetingSectionProps) {
  const meta = SECTION_META[kind];

  const testReady = saved.enabled && saved.channelId !== null;

  const handleEnabledToggle = (checked: boolean) => {
    onPatch({ ...draft, enabled: checked });
  };

  const handleUseImageToggle = (checked: boolean) => {
    if (checked && !draft.image) {
      onPatch({
        ...draft,
        useImage: true,
        image: DEFAULT_CARD_CONFIGS[kind].image,
      });
      return;
    }
    onPatch({ ...draft, useImage: checked });
  };

  const handleChannelChange = (value: string) => {
    onPatch({ ...draft, channelId: value === "" ? null : value });
  };

  return (
    <TabsContent
      value={asTabContent}
      className="min-w-0 space-y-5 pt-0"
      keepMounted
    >
      <section
        aria-label={`${meta.heading} 인사 설정`}
        className="min-w-0 space-y-5 pt-0"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 text-xs text-muted-foreground sm:text-sm">{meta.description}</p>
          <div className="flex shrink-0 items-center gap-2">
            {dirty && <Badge size="sm">변경됨</Badge>}
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw size={14} />}
              onClick={onReset}
              disabled={saving || !dirty}
            >
              초기화
            </Button>
          </div>
        </div>

        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <Switch
            checked={draft.enabled}
            onChange={handleEnabledToggle}
            disabled={saving}
            label={meta.switchLabel}
            labelPosition="left"
          />
          <Switch
            checked={draft.useImage}
            onChange={handleUseImageToggle}
            disabled={saving}
            label="카드 이미지"
            labelPosition="left"
          />
        </div>

        <Field
          label="메시지 채널"
          description="입장·퇴장 메시지와 카드 이미지가 보내질 텍스트 채널이에요."
        >
          <ChannelSelect
            channels={channels}
            noneLabel="채널 지정 안 함"
            value={draft.channelId ?? ""}
            onChange={handleChannelChange}
            placeholder="채널을 선택해 주세요"
            disabled={saving}
          />
        </Field>

        <Field
          label="메시지 레이아웃"
          description="컨테이너는 본문·이미지를 하나로 묶고 강조색을 보여줘요. 컴포넌트 목록은 꾸밈 없이 나열해요."
        >
          <Select
            value={draft.layout}
            items={LAYOUT_LABELS}
            disabled={saving}
            onValueChange={(value) =>
              onPatch({ ...draft, layout: value as GreetingLayout })
            }
          >
            <SelectTrigger className="w-full sm:w-56" aria-label="메시지 레이아웃">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GREETING_LAYOUTS.map((layout) => (
                <SelectItem key={layout} value={layout}>
                  {LAYOUT_LABELS[layout]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {draft.layout === "container" && (
          <Field
            label="강조색"
            description={`컨테이너 왼쪽 선에 들어가는 색이에요. 봇 기본색을 되돌리면 ${DEFAULT_ACCENT_COLOR_HEX}을 써요.`}
          >
            <ColorPicker
              value={draft.accentColor ?? DEFAULT_ACCENT_COLOR_HEX}
              label="강조색"
              disabled={saving}
              presets={[DEFAULT_ACCENT_COLOR_HEX, ...COLOR_PRESETS]}
              onChange={(color) => onPatch({ ...draft, accentColor: color })}
            />
            {draft.accentColor !== null && (
              <div className="pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={() => onPatch({ ...draft, accentColor: null })}
                >
                  봇 기본색 사용
                </Button>
              </div>
            )}
          </Field>
        )}

        <GreetingTemplateField
          kind={kind}
          value={draft.template}
          disabled={saving}
          onChange={(template) => onPatch({ ...draft, template })}
        />

        {draft.useImage && draft.image && (
          <GreetingImageEditCard
            heading={meta.heading}
            guildId={guildId}
            guildName={guildName}
            draft={draft}
            saving={saving}
            visible={visible}
            onPatch={onPatch}
          />
        )}

        {onTest && (
          <GreetingTestPanel
            ready={testReady}
            pending={testPending ?? false}
            result={testResult ?? null}
            onTest={onTest}
          />
        )}
      </section>
    </TabsContent>
  );
}
