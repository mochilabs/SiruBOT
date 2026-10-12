import Container from "@/components/container";
import { Card } from "@/components/ui/card";
import { Skeleton, SkeletonCircle } from "@/components/ui/skeleton";

/**
 * 서버 대시보드 로딩 중 — 실제 화면과 같은 Container(네비바 여백·최대 폭) 안에
 * 헤더·탭 행·패널 모양을 그려요. 콘텐츠 영역 밖으로 벗어나지 않아요.
 */
export default function ServerDashboardLoading() {
  return (
    <Container>
      <section aria-busy="true" aria-label="서버 대시보드" className="space-y-6">
        {/* PageHeader 모양 (서버 아이콘+이름과 설명, 경계선) */}
        <header className="relative mb-6 flex flex-col gap-6 pb-6">
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

        {/* Tabs 모양 — 같은 border-b 라인 위에 아이콘+라벨 자리 */}
        <div role="presentation" className="-mb-px flex items-center gap-1 overflow-x-auto scrollbar-none">
          {[4.5, 3, 3.5, 3, 4.5, 3, 3.5].map((width, index) => (
            <div
              key={index}
              className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 ${
                index === 0 ? "border-primary" : "border-transparent"
              }`}
            >
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
      </section>
    </Container>
  );
}
