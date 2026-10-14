import { Card } from "@/components/ui/card";
import { Skeleton, SkeletonCircle, SkeletonLine } from "@/components/ui/skeleton";

/**
 * 로드된 GuildCard와 같은 모양을 미리 그리는 스켈레톤 — 모바일은 한 행 리스트(아바타 + 서버 이름 1줄 +
 * 정사각형 아이콘 버튼 2개), PC(md 이상)는 그리드 카드(아바타 + 이름/상태 2줄 + 하단 2버튼).
 * 컨테이너·간격은 실제 페이지와 동일하게 유지해요.
 */
export function ServersGridSkeleton({ count = 9 }: { count?: number }) {
    return (
        <section className="space-y-12" aria-busy="true" aria-live="polite">
            <div className="grid gap-3 md:gap-6 grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))]">
                {Array.from({ length: count }).map((_, index) => (
                    <Card key={index} padding="none" className="flex-row items-center gap-3 p-4 md:flex-col md:items-stretch md:gap-6 md:p-6">
                        <div className="flex min-w-0 flex-1 items-center gap-3 md:w-full md:flex-none md:gap-4">
                            <SkeletonCircle size="h-10 w-10 shrink-0 md:h-14 md:w-14" />
                            <div className="min-w-0 flex-1 space-y-1.5">
                                <SkeletonLine width="65%" height="h-5 md:h-6" />
                                <SkeletonLine width="50%" height="h-3.5" className="hidden md:block" />
                            </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2 md:mt-auto md:w-full">
                            <Skeleton className="h-11 w-11 rounded-control md:h-12 md:flex-1" />
                            <Skeleton className="h-11 w-11 rounded-control md:h-12 md:flex-1" />
                        </div>
                    </Card>
                ))}
            </div>
        </section>
    );
}

export function ServersPageSkeleton() {
    return (
        <>
            {/* PageHeader와 같은 구조 — pb-6·우측 유저 카드 크기를 그대로 맞춰요 */}
            <header aria-busy="true" className="relative mb-6 flex flex-col justify-between gap-6 pb-6 md:flex-row md:items-end">
                <div className="min-w-0 flex-1 space-y-1">
                    <SkeletonLine width="18rem" height="h-10 sm:h-12" className="max-w-full" />
                    <SkeletonLine width="22rem" height="h-5" className="max-w-full" />
                </div>
                <div className="flex w-full shrink-0 items-center md:w-auto">
                    <Skeleton className="h-16 w-60 max-w-full rounded-card" />
                </div>
            </header>

            <ServersGridSkeleton />
        </>
    );
}
