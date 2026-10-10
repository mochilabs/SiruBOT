import { Card } from "@/components/primitives/card";
import { SkeletonCircle, SkeletonLine } from "@/components/primitives/skeleton";

/**
 * 로드된 UI와 같은 모양을 미리 그리는 스켈레톤 — 모바일은 행 리스트,
 * PC(md 이상)는 그리드 카드. 컨테이너·간격은 실제 페이지와 동일하게 유지해요.
 */
export function ServersGridSkeleton({ count = 9 }: { count?: number }) {
    return (
        <section className="space-y-12" aria-busy="true" aria-live="polite">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
                {Array.from({ length: count }).map((_, index) => (
                    <Card key={index} padding="none" className="flex-row items-center gap-3 p-4 md:flex-col md:items-stretch md:gap-6 md:p-6">
                        <div className="flex flex-1 items-center gap-3 md:w-full md:flex-none md:gap-4">
                            <SkeletonCircle size="h-10 w-10 shrink-0 md:h-14 md:w-14" />
                            <div className="min-w-0 flex-1 space-y-1.5 md:space-y-2">
                                <SkeletonLine width="66%" height="h-4" />
                                <SkeletonLine width="50%" height="h-3" />
                            </div>
                        </div>

                        <SkeletonLine width="5.5rem" height="h-11" className="shrink-0 rounded-control md:hidden" />
                        <SkeletonLine height="h-12" className="mt-auto hidden md:block" />
                    </Card>
                ))}
            </div>
        </section>
    );
}

export function ServersPageSkeleton() {
    return (
        <>
            {/* PageHeader와 같은 구조 — pb-6·경계선·간격을 그대로 맞춰요 */}
            <header aria-busy="true" className="relative mb-6 flex flex-col justify-between gap-6 pb-6 border-b border-border/40 md:flex-row md:items-end">
                <div className="min-w-0 flex-1 space-y-1">
                    <SkeletonLine width="18rem" height="h-10 sm:h-12" className="max-w-full" />
                    <SkeletonLine height="h-5" />
                </div>
                <div className="flex w-full shrink-0 items-center md:w-auto">
                    <SkeletonLine width="24rem" height="h-16" className="max-w-sm rounded-card" />
                </div>
            </header>

            <ServersGridSkeleton />
        </>
    );
}
