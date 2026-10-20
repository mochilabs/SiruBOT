"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_GREETINGS,
  GREETING_LAYOUTS,
  GREETING_TEMPLATE_VARIABLES,
  type GreetingConfig,
  type GreetingKind,
  type GreetingLayout,
} from "@sirubot/utils/memberGreeting";
import { ImagePlus, RotateCcw, Send, UserPlus } from "lucide-react";

import { ChannelSelect } from "@/components/discord/channel-select";
import { Field } from "@/components/primitives/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { COLOR_PRESETS,ColorPicker } from "@/components/ui/color-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { useGuildChannels } from "@/hooks/use-guild-settings";
import { useMemberGreeting } from "@/hooks/use-member-greeting";
import { toError } from "@/lib/api-error";
import type { DiscordChannelSummary } from "@/types/discord";
import type { GreetingTestResult } from "@/types/member-greeting";

import { GreetingImageEditor } from "./member-greeting/greeting-image-editor";
import {
  PanelError,
  PanelHeader,
  PanelLoading,
  SaveBar,
  WarningBox,
} from "./settings-shared";

/**
 * 봇 기본 강조색(#RRGGBB) — accentColor를 지정하지 않을 때 초기값으로 보여줘요.
 * 원본은 packages/utils constants.ts의 DEFAULT_COLOR_HEX인데 배럴 전용 export라 서브패스로
 * 가져올 수 없어 리터럴을 유지해요 — 봇 기본색이 바뀌면 같이 업데이트해요.
 */
const DEFAULT_ACCENT_COLOR_HEX = "#ffdaff";

const TEMPLATE_MAX = 500;

/** 메시지 레이아웃 라벨 — Select의 값 표시와 옵션 목록이 같은 표를 써요 */
const LAYOUT_LABELS: Record<GreetingLayout, string> = {
  container: "컨테이너",
  components: "컴포넌트 목록",
};

const SECTION_META: Record<
  GreetingKind,
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
};

/** 실제 전송 시 채워지는 값의 예시를 보여줘요 (jtc 템플릿 미리보기와 같은 방식) */
function sampleTemplate(template: string): string {
  return template
    .replaceAll("{유저}", "@철수")
    .replaceAll("{유저이름}", "철수")
    .replaceAll("{서버}", "이 서버")
    .replaceAll("{멤버수}", "123");
}

export function MemberGreetingSettings({
  guildId,
  visible,
  guildName,
}: {
  guildId: string;
  visible: boolean;
  guildName: string | null;
}) {
  return (
    <MemberGreetingPanel
      guildId={guildId}
      visible={visible}
      guildName={guildName}
    />
  );
}

function MemberGreetingPanel({
  guildId,
  visible,
  guildName,
}: {
  guildId: string;
  visible: boolean;
  guildName: string | null;
}) {
  const toast = useToast();
  const {
    pair,
    drafts,
    error,
    isLoading,
    saving,
    save,
    patchKind,
    testPending,
    testResults,
    startTest,
    reload,
  } = useMemberGreeting(guildId);
  const {
    channels,
    error: channelsError,
    reload: reloadChannels,
  } = useGuildChannels(guildId);

  const savedOr = useCallback(
    (kind: GreetingKind): GreetingConfig =>
      pair?.[kind] ?? DEFAULT_GREETINGS[kind],
    [pair],
  );
  const dirtyWelcome =
    JSON.stringify(drafts.welcome) !== JSON.stringify(savedOr("welcome"));
  const dirtyGoodbye =
    JSON.stringify(drafts.goodbye) !== JSON.stringify(savedOr("goodbye"));
  const anyDirty = dirtyWelcome || dirtyGoodbye;

  // 변경을 저장하지 않고 페이지를 벗어나면 브라우저 확인을 요청해요 (패널 안 표시는 InfoBox로도 안내해요)
  useEffect(() => {
    if (!anyDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [anyDirty]);

  const handleSave = useCallback(async () => {
    try {
      await save();
      toast.success(
        "인사 설정을 저장했어요.",
        "멤버 입장·퇴장 때 새 설정이 적용돼요.",
      );
    } catch (err) {
      const apiError = toError(err, "인사 설정을 저장하지 못했어요.");
      toast.error(
        apiError.message,
        apiError.retryable ? "잠시 후 다시 시도해 주세요." : undefined,
      );
    }
  }, [save, toast]);

  if (error) return <PanelError error={error} onRetry={reload} />;
  if (isLoading || !pair || !drafts.welcome || !drafts.goodbye) {
    return <PanelLoading label="인사 설정 불러오는 중…" />;
  }

  return (
    <Card padding="lg" className="gap-8 overflow-visible">
      <PanelHeader
        icon={<UserPlus className="h-5 w-5" />}
        title="멤버 인사"
        description="멤버가 입장·퇴장할 때 환영·작별 메시지와 카드 이미지를 보내요."
      />

      {channelsError && (
        <WarningBox>
          채널 목록을 불러오지 못했어요. ({channelsError.message}){" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={reloadChannels}
          >
            다시 시도
          </button>
        </WarningBox>
      )}
      <Tabs defaultValue="welcome" className="min-w-0">
        <TabsList className="w-full sm:w-fit" aria-label="멤버 인사 유형">
          <TabsTrigger value="welcome" className="flex-1 sm:flex-none">
            환영
          </TabsTrigger>
          <TabsTrigger value="goodbye" className="flex-1 sm:flex-none">
            작별
          </TabsTrigger>
        </TabsList>
        <GreetingSection
          asTabContent="welcome"
          kind="welcome"
          guildId={guildId}
          visible={visible}
          guildName={guildName}
          draft={drafts.welcome}
          saved={savedOr("welcome")}
          dirty={dirtyWelcome}
          channels={channels}
          saving={saving}
          testPending={testPending("welcome")}
          testResult={testResults.welcome}
          onPatch={(next) => patchKind("welcome", next)}
          onReset={() => patchKind("welcome", DEFAULT_GREETINGS.welcome)}
          onTest={() => startTest("welcome")}
        />
        <GreetingSection
          asTabContent="goodbye"
          kind="goodbye"
          guildId={guildId}
          visible={visible}
          guildName={guildName}
          draft={drafts.goodbye}
          saved={savedOr("goodbye")}
          dirty={dirtyGoodbye}
          channels={channels}
          saving={saving}
          testPending={testPending("goodbye")}
          testResult={testResults.goodbye}
          onPatch={(next) => patchKind("goodbye", next)}
          onReset={() => patchKind("goodbye", DEFAULT_GREETINGS.goodbye)}
          onTest={() => startTest("goodbye")}
        />
      </Tabs>

      <SaveBar dirty={anyDirty} saving={saving} onSave={handleSave} />
    </Card>
  );
}

interface GreetingSectionProps {
  asTabContent: string;
  guildId: string;
  visible: boolean;
  guildName: string | null;
  kind: GreetingKind;
  draft: GreetingConfig;
  saved: GreetingConfig;
  dirty: boolean;
  channels: DiscordChannelSummary[] | null;
  saving: boolean;
  testPending: boolean;
  testResult: GreetingTestResult | null;
  onPatch: (next: GreetingConfig) => void;
  onReset: () => void;
  onTest: () => Promise<void>;
}

function GreetingSection({
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
  const toast = useToast();
  const meta = SECTION_META[kind];
  const templateRef = useRef<HTMLTextAreaElement>(null);
  const [sendingTest, setSendingTest] = useState(false);

  const handleTest = useCallback(async () => {
    setSendingTest(true);
    try {
      await onTest();
    } catch (err) {
      const apiError = toError(err, "테스트 전송을 요청하지 못했어요.");
      toast.error(
        apiError.message,
        apiError.retryable ? "잠시 후 다시 시도해 주세요." : undefined,
      );
    } finally {
      setSendingTest(false);
    }
  }, [onTest, toast]);

  // 테스트 전송은 봇이 읽을 "저장된 설정"으로 실행돼요 — 편집 중인 내용은 저장 후 테스트해요.
  const testReady = saved.enabled && saved.channelId !== null;

  const insertTemplateToken = useCallback(
    (token: string) => {
      const element = templateRef.current;
      const start = element?.selectionStart ?? draft.template.length;
      const end = element?.selectionEnd ?? start;
      const next =
        draft.template.slice(0, start) + token + draft.template.slice(end);
      onPatch({ ...draft, template: next.slice(0, TEMPLATE_MAX) });
      requestAnimationFrame(() => {
        if (!element) return;
        element.focus();
        const cursor = Math.min(start + token.length, TEMPLATE_MAX);
        element.setSelectionRange(cursor, cursor);
      });
    },
    [draft, onPatch],
  );

  const handleEnabledToggle = (checked: boolean) => {
    onPatch({ ...draft, enabled: checked });
  };

  const handleUseImageToggle = (checked: boolean) => {
    if (checked && !draft.image) {
      onPatch({
        ...draft,
        useImage: true,
        image: DEFAULT_GREETINGS[kind].image,
      });
      return;
    }
    onPatch({ ...draft, useImage: checked });
  };

  const handleChannelChange = (value: string) => {
    onPatch({ ...draft, channelId: value === "" ? null : value });
  };

  const [editorOpen, setEditorOpen] = useState(false);

  return (
    <TabsContent
      value={asTabContent}
      className="mt-5 min-w-0 space-y-5"
      keepMounted
    >
      <section
        aria-label={`${meta.heading} 인사 설정`}
        className="min-w-0 space-y-5"
      >
        <div>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-foreground">
              {meta.heading}
            </h3>
            <div className="flex items-center gap-2">
              {dirty && <Badge size="sm">변경됨</Badge>}
              <Button
                variant="ghost"
                size="sm"
                icon={<RotateCcw size={14} />}
                onClick={onReset}
                disabled={saving || !dirty}
                className="pointer-coarse:h-11"
              >
                초기화
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{meta.description}</p>
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
                  className="pointer-coarse:h-11"
                >
                  봇 기본색 사용
                </Button>
              </div>
            )}
          </Field>
        )}

        <Field
          label="메시지 템플릿"
          description="멤버 이름·서버 정보는 변수로 넣어요. 실제 값은 전송 시 채워져요."
        >
          <Textarea
            ref={templateRef}
            value={draft.template}
            maxLength={TEMPLATE_MAX}
            rows={3}
            disabled={saving}
            onChange={(event) =>
              onPatch({ ...draft, template: event.target.value })
            }
            placeholder={DEFAULT_GREETINGS[kind].template}
          />
          <div
            className="flex flex-wrap items-center gap-1.5 pt-1"
            role="group"
            aria-label="템플릿 변수 삽입"
          >
            {GREETING_TEMPLATE_VARIABLES.map((variable) => (
              <Button
                key={variable.token}
                variant="secondary"
                size="sm"
                disabled={saving}
                title={variable.description}
                onClick={() => insertTemplateToken(variable.token)}
                className="pointer-coarse:h-11"
              >
                {variable.token}
                {!variable.usableInImage && (
                  <span className="text-2xs text-muted-foreground">
                    봇 메시지 전용
                  </span>
                )}
              </Button>
            ))}
          </div>
          <p className="text-2xs text-muted-foreground">
            {draft.template.length}/{TEMPLATE_MAX} · 예시:{" "}
            <span className="text-foreground font-semibold">
              {sampleTemplate(
                draft.template.trim() || DEFAULT_GREETINGS[kind].template,
              )}
            </span>
          </p>
        </Field>

        {draft.useImage && draft.image && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-surface-2 p-3">
            <p className="min-w-0 flex-1 text-sm text-muted-foreground">
              카드 이미지와 레이어를 편집해요.
            </p>
            <Button
              variant="secondary"
              size="sm"
              icon={<ImagePlus size={14} />}
              onClick={() => setEditorOpen(true)}
              disabled={saving}
            >
              이미지 편집
            </Button>
            <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
              <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-6xl overflow-y-auto sm:max-h-[90dvh] sm:max-w-6xl">
                <DialogHeader>
                  <DialogTitle>{meta.heading} 카드 이미지</DialogTitle>
                  <DialogDescription>
                    미리보기에서 요소를 옮기고, 선택 핸들을 드래그해 크기를
                    조절할 수 있어요.
                  </DialogDescription>
                </DialogHeader>
                <GreetingImageEditor
                  guildId={guildId}
                  guildName={guildName}
                  config={draft}
                  image={draft.image}
                  saving={saving}
                  active={visible && editorOpen}
                  onPatch={onPatch}
                />
              </DialogContent>
            </Dialog>
          </div>
        )}

        <div className="space-y-2 rounded-card bg-surface-2 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<Send size={14} />}
              loading={sendingTest || testPending}
              disabled={!testReady}
              onClick={() => void handleTest()}
              className="pointer-coarse:h-11"
            >
              테스트 전송
            </Button>
            {testPending && (
              <p className="text-xs text-muted-foreground">
                테스트 전송 결과를 기다리는 중…
              </p>
            )}
          </div>
          <p className="text-2xs text-muted-foreground">
            {testReady
              ? "저장된 설정대로 본인 멤버 카드를 그려 메시지 채널에 보내요."
              : "테스트 전송은 저장된 설정으로 진행돼요. 저장한 뒤 활성화와 채널이 준비되면 보낼 수 있어요."}
          </p>
          {!testPending &&
            testResult &&
            (testResult.ok ? (
              <p className="text-xs text-success">
                테스트 메시지를 전송했어요. Discord 채널을 확인해 주세요.
              </p>
            ) : (
              <p role="alert" className="text-xs text-destructive">
                {testResult.timedOut
                  ? "테스트 전송 결과를 확인하지 못했어요. Discord 채널을 직접 확인해 주세요."
                  : (testResult.error ?? "테스트 전송에 실패했어요.")}
              </p>
            ))}
        </div>
      </section>
    </TabsContent>
  );
}
