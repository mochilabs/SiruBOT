import { Skeleton } from "@/components/primitives/skeleton";

/** 서버 대시보드 로딩 중 — 컨트롤러·설정 패널 자리에 스켈레톤을 먼저 그려요 */
export default function ServerDashboardLoading() {
  return (
    <section aria-label="서버 대시보드" className="space-y-6">
      <div className="space-y-2">
        <Skeleton.Line width="28%" height="h-7" />
        <Skeleton.Line width="45%" height="h-4" />
      </div>
      <span role="status" className="sr-only">
        대시보드를 불러오는 중…
      </span>
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton.Card lines={3} />
        <Skeleton.Card lines={3} />
      </div>
      <Skeleton.Card lines={4} />
    </section>
  );
}