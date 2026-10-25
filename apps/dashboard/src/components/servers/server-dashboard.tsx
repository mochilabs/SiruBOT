"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3,
  Bell,
  Bot,
  Hash,
  Images,
  MessageSquare,
  Music,
  Radio,
  ShieldAlert,
  SlidersHorizontal,
  SquareSlash,
  UserPlus,
  UserRoundCog,
  Volume2,
} from "lucide-react";

import PlayerLiveTab from "@/components/player/player-live-tab";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { AiSettings } from "./ai-settings";
import { AssetsSettings } from "./assets-settings";
import { BotProfileSettings } from "./bot-profile-settings";
import { ChannelSettings } from "./channel-settings";
import { ChatToolsSettings } from "./chat-tools-settings";
import { CustomCommandsSettings } from "./custom-commands-settings";
import { JtcSettings } from "./jtc-settings";
import { MemberGreetingSettings } from "./member-greeting-settings";
import { MixerSettings } from "./mixer-settings";
import { MusicSettings } from "./music-settings";
import { ServerFeatureSidebar } from "./server-feature-sidebar";
import ServerStatsTab from "./server-stats-tab";
import { SERVER_TABS, type ServerTabKey } from "./server-tabs";
import { hasUnsavedActiveSettings, nudgeSaveBar, SettingsPanelActive } from "./settings-shared";
import SocialAlertsSettings from "./social-alerts-settings";

const ICONS = {
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
  mixer: <SlidersHorizontal size={14} />,
  social: <Bell size={14} />,
  greeting: <UserPlus size={14} />,
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
 * 서버 대시보드 셸 — PC(lg+)는 기능 사이드바 + 설정 패널, 모바일은 기존 가로 탭을 유지해요.
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
  const tabFromUrl = (value: string | null): ServerTabKey =>
    TABS.some((item) => item.key === value) ? (value as ServerTabKey) : "ai";
  const [tab, setTab] = useState<ServerTabKey>(() =>
    tabFromUrl(searchParams.get("tab")),
  );
  const mobileTabsRef = useRef<HTMLDivElement>(null);
  const nudgeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    // 뒤로가기 등으로 URL이 바뀌면 대기 중이던 nudge 전환 타이머가 오래된 탭을 덮어쓰지 않도록 취소해요
    if (nudgeTimerRef.current) {
      window.clearTimeout(nudgeTimerRef.current);
      nudgeTimerRef.current = null;
    }
    setTab(tabFromUrl(searchParams.get("tab")));
  }, [searchParams]);

  const selectTab = (value: string) => {
    const nextTab = tabFromUrl(value);
    const commit = () => {
      setTab(nextTab);
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", nextTab);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    };
    if (nextTab === tab || !hasUnsavedActiveSettings()) {
      commit();
      return;
    }
    // 저장하지 않은 채 다른 탭으로 떠나려 하면 막지 말고 저장 바를 흔들어 알려줘요 (모달 대신)
    nudgeSaveBar();
    if (nudgeTimerRef.current) window.clearTimeout(nudgeTimerRef.current);
    nudgeTimerRef.current = window.setTimeout(() => {
      nudgeTimerRef.current = null;
      commit();
    }, 480);
  };

  useEffect(() => () => {
    if (nudgeTimerRef.current) window.clearTimeout(nudgeTimerRef.current);
  }, []);

  useEffect(() => {
    const container = mobileTabsRef.current;
    const item = container?.querySelector<HTMLElement>(
      `[data-mobile-tab="${tab}"]`,
    );
    if (!container || !item) return;

    const containerRect = container.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
    if (itemRect.left < containerRect.left) {
      container.scrollBy({
        left: itemRect.left - containerRect.left - 8,
        behavior,
      });
    } else if (itemRect.right > containerRect.right) {
      container.scrollBy({
        left: itemRect.right - containerRect.right + 8,
        behavior,
      });
    }
  }, [tab]);

  if (!manageable) return <NotManageable />;

  return (
    <div className="animate-page-in">
      <div className="flex flex-col items-start gap-4 lg:flex-row lg:gap-8">
        <ServerFeatureSidebar items={TABS} active={tab} onSelect={selectTab} />

        <div className="w-full min-w-0 flex-1">
          <Tabs
            value={tab}
            onValueChange={selectTab}
            className="w-full"
            aria-label="서버 설정 패널"
          >
            {/* 모바일 기능 네비게이션 서피스 — PC 사이드바(ServerFeatureSidebar)와 동일한
                Card 서피스 + rounded-menu 언어를 써서 부유하는 맨 요소 대신 안정된 표면을 제공해요.
                가로 스크롤은 카드 내부로 격리되고 활성 탭은 ServerFeatureSidebar와 일치하는
                primary-control/10 알약 스타일로 표시돼요. */}
            <Card padding="none" className="mb-4 overflow-hidden lg:hidden">
              <div
                ref={mobileTabsRef}
                className="w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain touch-pan-x scrollbar-none p-1.5"
              >
                <TabsList className="w-max min-w-full justify-start gap-1 whitespace-nowrap bg-transparent p-0">
                  {TABS.map((item) => (
                    <TabsTrigger
                      key={item.key}
                      value={item.key}
                      data-mobile-tab={item.key}
                      className="min-h-11 min-w-max flex-none gap-2 rounded-menu px-3.5 py-2.5 text-sm font-medium transition-colors duration-fast after:hidden hover:bg-accent/10 hover:text-foreground data-active:bg-primary-control/10 data-active:font-bold data-active:text-primary-text"
                    >
                      <span aria-hidden className="shrink-0">{item.icon}</span>
                      <span>{item.label}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            </Card>
            {TABS.map((item) => (
              <TabsContent
                key={item.key}
                value={item.key}
                className="pt-0 lg:pt-0"
                keepMounted
              >
                <SettingsPanelActive.Provider value={tab === item.key}>
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
                {item.key === "mixer" && <MixerSettings guildId={guildId} />}
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
                </SettingsPanelActive.Provider>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>
    </div>
  );
}
