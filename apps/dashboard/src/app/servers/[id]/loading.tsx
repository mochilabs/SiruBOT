import Container from "@/components/container";
import { Card } from "@/components/ui/card";
import { Skeleton, SkeletonCircle } from "@/components/ui/skeleton";

/**
 * 서버 대시보드 로딩 중 — 실제 화면과 같은 구조로 그려요: PageHeader(아이콘+이름) 아래
 * PC(lg+)는 기능 사이드바 카드 + 설정 패널 2단, 모바일은 가로 탭 스트립 + 패널이에요.
 * 실제 화면과 마찬가지로 콘텐츠 영역 밖으로 벗어나지 않아요.
 */
export default function ServerDashboardLoading() {
  return (
    <Container>
      <section aria-busy="true" aria-label="서버 대시보드" className="space-y-6">
        {/* PageHeader 모양 (서버 아이콘+이름과 설명) — mb-6가 없어요: section의 space-y-6이 간격을 내요 */}
        <header className="relative flex flex-col gap-6 pb-6">
          <div className="flex min-w-0 items-center gap-3">
            <SkeletonCircle size="h-12 w-12" />
            <div className="min-w-0 space-y-1">
              <Skeleton.Line width="14rem" height="h-10 sm:h-12" />
              <Skeleton.Line width="55%" height="h-5" />
            </div>
          </div>
        </header>

        <span role="status" className="sr-only">
          대시보드를 불러오는 중…
        </span>

        {/* ServerDashboard 셸 — PC는 사이드바+패널 2단, 모바일은 탭+패널 세로 */}
        <div className="flex flex-col items-start gap-4 lg:flex-row lg:gap-8">
          {/* PC 기능 사이드바 모양 (ServerFeatureSidebar — 카드 + 항목 9개) */}
          <Card aria-hidden padding="none" className="hidden w-full shrink-0 lg:block lg:w-72">
            <div className="flex flex-col gap-0.5 p-2">
              {Array.from({ length: 9 }, (_, index) => (
                <div key={index} className="flex items-center gap-2.5 px-3 py-2.5">
                  <SkeletonCircle size="h-3.5 w-3.5" />
                  <Skeleton.Line width={index === 0 ? "6rem" : "5rem"} height="h-4" />
                </div>
              ))}
            </div>
          </Card>

          <div className="w-full min-w-0 flex-1">
            {/* 모바일 탭 스트립 모양 — 활성 탭 자리에 실제 인디케이터와 같은 핑크 언더라인 */}
            <div role="presentation" className="mb-4 flex items-center gap-1 overflow-x-auto scrollbar-none lg:hidden">
              {[4.5, 3, 3.5, 3, 4.5, 3, 3.5].map((width, index) => (
                <div key={index} className="relative flex shrink-0 items-center gap-2 px-3 py-2">
                  {index === 0 && <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-primary-control" />}
                  <SkeletonCircle size="h-3.5 w-3.5" />
                  <Skeleton.Line width={`${width}rem`} height="h-4" />
                </div>
              ))}
            </div>

            {/* 활성 패널 — 설정 패널 카드와 같은 모양 (아이콘+제목 헤더, 두 단 필드, 저장 바) */}
            <Card aria-hidden>
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <SkeletonCircle size="h-10 w-10" />
                  <div className="min-w-0 space-y-2">
                    <Skeleton.Line width="10rem" height="h-5" />
                    <Skeleton.Line width="16rem" height="h-3" />
                  </div>
                </div>
                <div className="grid gap-6 sm:grid-cols-2">
                  {[0, 1, 2, 3].map((field) => (
                    <div key={field} className="space-y-2">
                      <Skeleton.Line width="5rem" height="h-3.5" />
                      <Skeleton.Line width="85%" height="h-9" />
                      <Skeleton.Line width="60%" height="h-3" />
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-end gap-2 pt-4">
                  <Skeleton.Line width="4.5rem" height="h-9" />
                  <Skeleton.Line width="6rem" height="h-9" />
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>
    </Container>
  );
}