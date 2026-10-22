"use client";

import { useCallback, useEffect } from "react";
import {
  DEFAULT_GREETINGS,
  type GreetingConfig,
  type GreetingKind,
} from "@sirubot/utils/memberGreeting";
import { UserPlus } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGuildChannels } from "@/hooks/use-guild-settings";
import { useMemberGreeting } from "@/hooks/use-member-greeting";
import { notifyApiError, notifySaved } from "@/lib/notify";

import { GreetingSection } from "./member-greeting/greeting-section";
import {
  ChannelListError,
  PanelError,
  PanelHeader,
  PanelLoading,
  SaveBar,
} from "./settings-shared";

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
      notifySaved("인사 설정을 저장했어요.", "멤버 입장·퇴장 때 새 설정이 적용돼요.");
    } catch (err) {
      notifyApiError(err, "인사 설정을 저장하지 못했어요.");
    }
  }, [save]);

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

      {channelsError && <ChannelListError error={channelsError} onRetry={reloadChannels} />}
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
