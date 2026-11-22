import { Fragment } from "react";

import Container from "@/components/container";
import { SERVER_TAB_GROUPS, SERVER_TABS } from "@/components/servers/server-tabs";
import { PanelLoading } from "@/components/servers/settings-shared";
import { Card } from "@/components/ui/card";
import { Skeleton, SkeletonCircle } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * 서버 대시보드 로딩 중 — 실제 화면과 같은 구조로 그려요:
 * 모바일은 PageHeader 안의 ServerSwitcher 트리거, PC(lg+)는 사이드바 카드 맨 위 트리거(size-8 아이콘 + 서버 이름)
 * PC(lg+)는 기능 사이드바 카드 + 설정 패널 2단, 모바일은 현재 기능 한 줄 버튼 + 패널이에요.
 * SaveBar는 편집 전에는 뜨지 않으므로 하단 가짜 취소/저장 버튼은 두지 않아요.
 * 탭 수·라벨 길이는 SERVER_TABS(실제 TABS와 같은 소스)에서 그대로 따라가요.
 */
export default function ServerDashboardLoading() {
  return (
    <Container>
      <section aria-busy="true" aria-label="서버 대시보드">
        
        <span role="status" className="sr-only">
          대시보드를 불러오는 중…
        </span>

        {/* ServerDashboard 셸 — PC는 사이드바+패널 2단, 모바일은 탭+패널 세로 */}
        <div className="flex flex-col items-start gap-4 lg:flex-row lg:gap-8">
          {/* PC 기능 사이드바 모양 (ServerFeatureSidebar — 카드 + 그룹 라벨 + 항목, TABS 길이와 동일) */}
          <Card aria-hidden padding="none" className="hidden w-full shrink-0 lg:block lg:w-72">
            {/* 서버 선택기 트리거 자리 */}
            <div className="flex min-h-12 items-center gap-3 border-b border-border-subtle p-2 px-3">
              <Skeleton className="size-8 shrink-0 rounded-control" />
              <Skeleton.Line width="8rem" height="h-5" />
            </div>
            <div className="flex flex-col gap-0.5 p-2">
              {SERVER_TABS.map((item, idx) => (
                <Fragment key={item.key}>
                  {item.group !== SERVER_TABS[idx - 1]?.group && SERVER_TAB_GROUPS[item.group] && (
                    <div className={cn("px-3.5 pb-1", idx === 0 ? "pt-1" : "pt-3")}>
                      <Skeleton.Line width="2.5rem" height="h-4" />
                    </div>
                  )}
                  <div className="flex items-center gap-2.5 px-3 py-2.5">
                    <SkeletonCircle size="h-3.5 w-3.5" />
                    <Skeleton.Line width={`${Math.max(2.5, item.label.length * 0.75)}rem`} height="h-4" />
                  </div>
                </Fragment>
              ))}
            </div>
          </Card>

          <div className="w-full min-w-0 flex-1">
            {/* 모바일 기능 네비게이션 — ServerMobileNav의 한 줄 버튼과 같은 크기 */}
            <div aria-hidden className="mb-3 flex gap-2 lg:hidden">
              <Skeleton className="min-h-11 flex-1 rounded-menu" />
              <Skeleton className="min-h-11 w-28 rounded-menu" />
            </div>

            {/* 활성 패널 — 설정 패널 카드(padding="lg")와 같은 모양 */}
            <PanelLoading label="" decorative />
          </div>
        </div>
      </section>
    </Container>
  );
}