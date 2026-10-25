import Container from "@/components/container";
import { SERVER_TABS } from "@/components/servers/server-tabs";
import { Card } from "@/components/ui/card";
import { Skeleton, SkeletonCircle } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * 서버 대시보드 로딩 중 — 실제 화면과 같은 구조로 그려요:
 * PageHeader(!mb-2 !pb-2) 안의 ServerSwitcher 트리거(size-8 rounded-control 아이콘 + 서버 이름) 아래
 * PC(lg+)는 기능 사이드바 카드 + 설정 패널 2단, 모바일은 가로 탭 스트립 + 패널이에요.
 * SaveBar는 편집 전에는 뜨지 않으므로 하단 가짜 취소/저장 버튼은 두지 않아요.
 * 탭 수·라벨 길이는 SERVER_TABS(실제 TABS와 같은 소스)에서 그대로 따라가요.
 */
export default function ServerDashboardLoading() {
  return (
    <Container>
      <section aria-busy="true" aria-label="서버 대시보드">
        {/* PageHeader(!mb-2 !pb-2) + ServerSwitcher 트리거 모양 */}
        <header className="relative mb-2 flex flex-col justify-between gap-6 pb-2 md:flex-row md:items-end">
          <div className="min-w-0 flex-1">
            <div className="inline-flex min-h-12 items-center gap-3 px-2 py-1">
              <Skeleton className="size-8 shrink-0 rounded-control" />
              <Skeleton.Line width="10rem" height="h-7 sm:h-8" />
              <Skeleton className="size-4 shrink-0 rounded-sm" />
            </div>
          </div>
        </header>

        <span role="status" className="sr-only">
          대시보드를 불러오는 중…
        </span>

        {/* ServerDashboard 셸 — PC는 사이드바+패널 2단, 모바일은 탭+패널 세로 */}
        <div className="flex flex-col items-start gap-4 lg:flex-row lg:gap-8">
          {/* PC 기능 사이드바 모양 (ServerFeatureSidebar — 카드 + 항목, TABS 길이와 동일) */}
          <Card aria-hidden padding="none" className="hidden w-full shrink-0 lg:block lg:w-72">
            <div className="flex flex-col gap-0.5 p-2">
              {SERVER_TABS.map((item) => (
                <div key={item.key} className="flex items-center gap-2.5 px-3 py-2.5">
                  <SkeletonCircle size="h-3.5 w-3.5" />
                  <Skeleton.Line width={`${Math.max(2.5, item.label.length * 0.75)}rem`} height="h-4" />
                </div>
              ))}
            </div>
          </Card>

          <div className="w-full min-w-0 flex-1">
            {/* 모바일 기능 네비게이션 서피스 모양 (ServerDashboard 모바일 탭 카드와 동일 구조) */}
            <Card aria-hidden padding="none" className="mb-4 overflow-hidden lg:hidden">
              <div role="presentation" className="flex items-center gap-1 overflow-x-auto scrollbar-none p-1.5">
                {SERVER_TABS.map((item, index) => (
                  <div
                    key={item.key}
                    className={cn(
                      "relative flex min-h-11 shrink-0 items-center gap-2 rounded-menu px-3.5 py-2.5",
                      index === 0 && "bg-primary-control/10",
                    )}
                  >
                    <SkeletonCircle size="h-3.5 w-3.5" />
                    <Skeleton.Line width={`${Math.max(2.5, item.label.length * 0.75)}rem`} height="h-4" />
                  </div>
                ))}
              </div>
            </Card>

            {/* 활성 패널 — 설정 패널 카드(padding="lg")와 같은 모양 (PanelHeader 아이콘+제목, 2단 필드) */}
            <Card aria-hidden padding="lg">
              <div className="space-y-6">
                <div className="flex items-start gap-3">
                  <Skeleton className="h-10 w-10 shrink-0 rounded-control" />
                  <div className="min-w-0 space-y-1.5">
                    <Skeleton.Line width="9rem" height="h-5" />
                    <Skeleton.Line width="16rem" height="h-4" />
                  </div>
                </div>
                <div className="grid gap-6 sm:grid-cols-2">
                  {[0, 1, 2, 3].map((field) => (
                    <div key={field} className="space-y-2">
                      <Skeleton.Line width="5rem" height="h-4" />
                      <Skeleton.Line width="100%" height="h-9" />
                      <Skeleton.Line width="65%" height="h-3.5" />
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>
    </Container>
  );
}