"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getBotModule, isModuleDisabled, sanitizeDisabledModules } from "@sirubot/utils/modules";
import {
  BarChart3,
  Bell,
  Bot,
  Cake,
  CalendarClock,
  Hash,
  Images,
  LayoutDashboard,
  LayoutGrid,
  MessageSquare,
  Music,
  Power,
  Radio,
  ShieldAlert,
  ShieldCheck,
  SquareSlash,
  Star,
  Ticket,
  UserPlus,
  UserRoundCog,
  Volume2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useGuildSettings } from "@/hooks/use-guild-settings";
import { notifyApiError, notifySaved } from "@/lib/notify";

import { toggleModuleDisabled } from "./modules-settings";
import { ServerFeatureSidebar } from "./server-feature-sidebar";
import { ServerMobileNav } from "./server-mobile-nav";
import { getTabModule, resolveServerTab, SERVER_TAB_GROUPS, SERVER_TABS, type ServerTabKey } from "./server-tabs";
import { hasUnsavedActiveSettings, PanelLoading, registerSettingsDiscardHandler, saveActiveSettings, SettingsPanelActive } from "./settings-shared";
import { UnsavedNavigationGuard } from "./unsaved-navigation-guard";

function TabLoadingFallback() {
  return <PanelLoading label="불러오는 중…" decorative />;
}

const ServerOverviewTab = dynamic(() => import("./server-overview-tab").then((m) => m.ServerOverviewTab), { loading: TabLoadingFallback });
const ModulesSettings = dynamic(() => import("./modules-settings").then((m) => m.ModulesSettings), { loading: TabLoadingFallback });
const AiSettings = dynamic(() => import("./ai-settings").then((m) => m.AiSettings), { loading: TabLoadingFallback });
const CustomCommandsSettings = dynamic(() => import("./custom-commands-settings").then((m) => m.CustomCommandsSettings), { loading: TabLoadingFallback });
const AssetsSettings = dynamic(() => import("./assets-settings").then((m) => m.AssetsSettings), { loading: TabLoadingFallback });
const BotProfileSettings = dynamic(() => import("./bot-profile-settings").then((m) => m.BotProfileSettings), { loading: TabLoadingFallback });
const MusicSettings = dynamic(() => import("./music-settings").then((m) => m.MusicSettings), { loading: TabLoadingFallback });
const PlayerLiveTab = dynamic(() => import("@/components/player/player-live-tab"), { loading: TabLoadingFallback });
const ServerStatsTab = dynamic(() => import("./server-stats-tab"), { loading: TabLoadingFallback });
const ChannelSettings = dynamic(() => import("./channel-settings").then((m) => m.ChannelSettings), { loading: TabLoadingFallback });
const ChatToolsSettings = dynamic(() => import("./chat-tools-settings").then((m) => m.ChatToolsSettings), { loading: TabLoadingFallback });
const JtcSettings = dynamic(() => import("./jtc-settings").then((m) => m.JtcSettings), { loading: TabLoadingFallback });
const SocialAlertsSettings = dynamic(() => import("./social-alerts-settings"), { loading: TabLoadingFallback });
const MemberGreetingSettings = dynamic(() => import("./member-greeting-settings").then((m) => m.MemberGreetingSettings), { loading: TabLoadingFallback });
const BirthdaySettings = dynamic(() => import("./birthday-settings").then((m) => m.BirthdaySettings), { loading: TabLoadingFallback });
const TicketSettings = dynamic(() => import("./ticket-settings").then((m) => m.TicketSettings), { loading: TabLoadingFallback });
const StarboardSettings = dynamic(() => import("./starboard-settings").then((m) => m.StarboardSettings), { loading: TabLoadingFallback });
const ScheduledMessagesSettings = dynamic(() => import("./scheduled-messages-settings").then((m) => m.ScheduledMessagesSettings), { loading: TabLoadingFallback });
const RolePanelsSettings = dynamic(() => import("./role-panels-settings").then((m) => m.RolePanelsSettings), { loading: TabLoadingFallback });
const ICONS = {
  overview: <LayoutDashboard size={14} />,
  modules: <LayoutGrid size={14} />,
  ai: <Bot size={14} />,
  "custom-commands": <SquareSlash size={14} />,
  assets: <Images size={14} />,
  profile: <UserRoundCog size={14} />,
  music: <Music size={14} />,
  "player-live": <Radio size={14} />,
  stats: <BarChart3 size={14} />,
  channels: <Hash size={14} />,
  "chat-tools": <MessageSquare size={14} />,
  jtc: <Volume2 size={14} />,
  social: <Bell size={14} />,
  greeting: <UserPlus size={14} />,
  ticket: <Ticket size={14} />,
  starboard: <Star size={14} />,
  birthday: <Cake size={14} />,
  "scheduled-messages": <CalendarClock size={14} />,
  "role-panels": <ShieldCheck size={14} />,
} as const;
// 탭 목록(키·라벨)은 server-tabs.ts가 단일 소스예요 — loading.tsx 스켈레톤도 여기를 따라가요
const TABS = SERVER_TABS.map((item) => ({ ...item, icon: ICONS[item.key] }));
function NotManageable() {
  return (
    <Card
      padding="lg"
      className="text-sm text-muted-foreground space-y-2 border-0"
    >
      <p className="flex items-center gap-2 font-bold text-foreground">
        <ShieldAlert size={16} className="text-warning" /> 설정은 서버 관리자만
        변경할 수 있어요.
      </p>
      <p>
        서버 관리자(Manage Server) 권한이 필요해요. 서버 설정에서 권한을 받은 뒤
        다시 시도해 주세요.
      </p>
    </Card>
  );
}

/**
 * 서버 대시보드 셸 — PC(lg+)는 기능 사이드바 + 설정 패널, 모바일은 현재 기능 버튼 + 바텀시트(ServerMobileNav)를 써요.
 * 탭/사이드바는 패널을 숨기기만 해(언마운트하지 않아) 편집 중인 입력값이 보존되고,
 * 패널은 Tabs 안에서 한 번만 렌더돼 두 내비게이션이 같은 상태를 공유해요(중복 마운트·중복 요청 방지).
 * 데스크톱에서는 탭 스트립만 숨기고(listClassName) 사이드바를 띄워요.
 * 토스트는 root layout의 전역 <Toaster />가 렌더해요 — 페이지별 Provider 두지 않아요.
 */
export function ServerDashboard({
  guildId,
  manageable,
  guildName,
}: {
  guildId: string;
  manageable: boolean;
  guildName: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialTab = resolveServerTab(searchParams.get("tab"));
  const [tab, setTab] = useState<ServerTabKey>(initialTab);
  // 한 번이라도 방문한 탭만 마운트하여 초기 진입 번들/요청을 최소화하고, 방문한 탭은 상태를 보존해요
  const [visitedTabs, setVisitedTabs] = useState<Set<ServerTabKey>>(() => new Set([initialTab]));
  /** 저장하지 않은 변경이 있어 이동이 보류된 대상 탭 — 값이 있으면 확인 다이얼로그가 떠요 */
  const [pendingTab, setPendingTab] = useState<ServerTabKey | null>(null);
  const [savingBeforeLeave, setSavingBeforeLeave] = useState(false);
  /** 변경 취소 시 해당 탭 패널을 새로 마운트해 편집 중이던 값을 버려요 */
  const [panelResets, setPanelResets] = useState<Partial<Record<ServerTabKey, number>>>({});
  const { settings, saving: savingModules, save: saveSettings } = useGuildSettings(guildId, manageable);
  const disabledModules = useMemo(() => sanitizeDisabledModules(settings?.disabledModules), [settings?.disabledModules]);
  const navItems = useMemo(
    () =>
      TABS.map((item) => ({
        ...item,
        dimmed: "module" in item && isModuleDisabled(disabledModules, item.module),
      })),
    [disabledModules],
  );
  const activeTabModule = getTabModule(tab);
  const activeDisabledModule =
    activeTabModule && isModuleDisabled(disabledModules, activeTabModule) ? getBotModule(activeTabModule) : null;
  useEffect(() => {
    const next = resolveServerTab(searchParams.get("tab"));
    setTab(next);
    setVisitedTabs((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
  }, [searchParams]);
  const commitTab = (nextTab: ServerTabKey) => {
    setTab(nextTab);
    setVisitedTabs((prev) => (prev.has(nextTab) ? prev : new Set(prev).add(nextTab)));
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };
  const selectTab = (value: string) => {
    const nextTab = resolveServerTab(value);
    if (nextTab === tab) return;
    // 저장하지 않은 변경이 있으면 저장하거나 취소하기 전에는 다른 탭으로 못 가요
    if (hasUnsavedActiveSettings()) {
      setPendingTab(nextTab);
      return;
    }
    commitTab(nextTab);
  };
  const enableActiveModule = async () => {
    if (!activeDisabledModule || savingModules) return;
    try {
      await saveSettings({
        disabledModules: toggleModuleDisabled(disabledModules, activeDisabledModule.id, true),
      });
      notifySaved(`${activeDisabledModule.label} 모듈을 켰어요.`);
    } catch (err) {
      notifyApiError(err, "모듈을 켜지 못했어요.");
    }
  };
  // 저장 바의 "취소" — 현재 탭 패널을 새로 마운트해 편집 중이던 값을 버려요
  useEffect(
    () => registerSettingsDiscardHandler(() => setPanelResets((prev) => ({ ...prev, [tab]: (prev[tab] ?? 0) + 1 }))),
    [tab],
  );
  const discardAndLeave = () => {
    if (!pendingTab) return;
    setPanelResets((prev) => ({ ...prev, [tab]: (prev[tab] ?? 0) + 1 }));
    commitTab(pendingTab);
    setPendingTab(null);
  };
  const saveAndLeave = async () => {
    if (!pendingTab || savingBeforeLeave) return;
    setSavingBeforeLeave(true);
    try {
      const saved = await saveActiveSettings();
      if (saved) {
        commitTab(pendingTab);
        setPendingTab(null);
      } else {
        // 저장 실패는 각 패널이 토스트로 알렸어요 — 이동하지 않고 편집 상태를 유지해요
        setPendingTab(null);
      }
    } finally {
      setSavingBeforeLeave(false);
    }
  };

  if (!manageable) return <NotManageable />;

  return (
    <div className="animate-page-in">
      <UnsavedNavigationGuard />
      <div className="flex flex-col items-start gap-4 lg:flex-row lg:gap-8">
        <ServerFeatureSidebar items={navItems} active={tab} onSelect={selectTab} groupLabels={SERVER_TAB_GROUPS} />

        <div className="w-full min-w-0 flex-1">
          <Tabs
            value={tab}
            onValueChange={selectTab}
            className="w-full"
            aria-label="서버 설정 패널"
          >
            {/* 모바일 기능 네비게이션 — 현재 기능 한 줄 버튼, 누르면 그룹별 전체 목록이 바텀시트로 열려요 */}
            <ServerMobileNav items={navItems} active={tab} onSelect={selectTab} groupLabels={SERVER_TAB_GROUPS} />
            {activeDisabledModule && (
              <div
                role="status"
                className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-card bg-surface-2 px-4 py-3 text-sm"
              >
                <p className="min-w-0 text-muted-foreground">
                  <span className="font-bold text-foreground">
                    <span aria-hidden className="mr-1">
                      {activeDisabledModule.emoji}
                    </span>
                    {activeDisabledModule.label}
                  </span>{" "}
                  모듈이 꺼져 있어요.
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  loading={savingModules}
                  onClick={() => void enableActiveModule()}
                  className="shrink-0"
                >
                  <Power size={14} aria-hidden />
                  모듈 켜기
                </Button>
              </div>
            )}
            {TABS.map((item) => (
              <TabsContent
                key={item.key}
                value={item.key}
                className="pt-0 lg:pt-0"
                keepMounted
              >
                <SettingsPanelActive.Provider value={tab === item.key}>
                {visitedTabs.has(item.key) && (
                  <Fragment key={panelResets[item.key] ?? 0}>
                    {item.key === "overview" && <ServerOverviewTab guildId={guildId} onSelectTab={selectTab} />}
                    {item.key === "modules" && <ModulesSettings guildId={guildId} />}
                    {item.key === "ai" && <AiSettings guildId={guildId} />}
                    {item.key === "custom-commands" && (
                      <CustomCommandsSettings guildId={guildId} />
                    )}
                    {item.key === "assets" && <AssetsSettings guildId={guildId} />}
                    {item.key === "profile" && (
                      <BotProfileSettings guildId={guildId} />
                    )}
                    {item.key === "music" && <MusicSettings guildId={guildId} />}
                    {item.key === "player-live" && (
                      <PlayerLiveTab guildId={guildId} />
                    )}
                    {item.key === "stats" && <ServerStatsTab guildId={guildId} />}
                    {item.key === "channels" && (
                      <ChannelSettings guildId={guildId} />
                    )}
                    {item.key === "chat-tools" && (
                      <ChatToolsSettings guildId={guildId} />
                    )}
                    {item.key === "jtc" && <JtcSettings guildId={guildId} />}
                    {item.key === "social" && (
                      <SocialAlertsSettings
                        guildId={guildId}
                        visible={tab === "social"}
                      />
                    )}
                    {item.key === "greeting" && (
                      <MemberGreetingSettings
                        guildId={guildId}
                        visible={tab === "greeting"}
                        guildName={guildName}
                      />
                    )}
                    {item.key === "birthday" && (
                      <BirthdaySettings
                        guildId={guildId}
                        visible={tab === "birthday"}
                        guildName={guildName}
                      />
                    )}
                    {item.key === "ticket" && (
                      <TicketSettings guildId={guildId} />
                    )}
                    {item.key === "starboard" && (
                      <StarboardSettings guildId={guildId} />
                    )}
                    {item.key === "scheduled-messages" && (
                      <ScheduledMessagesSettings guildId={guildId} />
                    )}
                    {item.key === "role-panels" && (
                      <RolePanelsSettings guildId={guildId} />
                    )}
                  </Fragment>
                )}
                </SettingsPanelActive.Provider>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>
      <Dialog open={pendingTab !== null} onOpenChange={(open) => { if (!open && !savingBeforeLeave) setPendingTab(null); }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>저장하지 않은 변경 사항이 있어요</DialogTitle>
            <DialogDescription>다른 탭으로 이동하기 전에 변경 사항을 저장하거나 취소해 주세요.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" className="min-h-11" disabled={savingBeforeLeave} onClick={() => setPendingTab(null)}>
              계속 편집
            </Button>
            <Button variant="secondary" className="min-h-11" disabled={savingBeforeLeave} onClick={discardAndLeave}>
              변경 취소
            </Button>
            <Button variant="cta" className="min-h-11" loading={savingBeforeLeave} onClick={() => void saveAndLeave()}>
              저장하기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
