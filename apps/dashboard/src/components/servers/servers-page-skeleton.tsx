import { Card } from "@/components/primitives/card";
import { SkeletonCircle, SkeletonLine } from "@/components/primitives/skeleton";

export function ServersGridSkeleton({ count = 9 }: { count?: number }) {
    return (
        <section className="space-y-12" aria-busy="true" aria-live="polite">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: count }).map((_, index) => (
                    <Card key={index} className="gap-6">
                        <div className="flex items-center gap-4">
                            <SkeletonCircle size="h-14 w-14" />
                            <div className="flex-1 space-y-2">
                                <SkeletonLine width="66%" height="h-4" />
                                <SkeletonLine width="50%" height="h-3" />
                            </div>
                        </div>

                        <SkeletonLine height="h-12" className="mt-auto" />
                    </Card>
                ))}
            </div>
        </section>
    );
}

export function ServersPageSkeleton() {
    return (
        <>
            <header className="mb-6 flex flex-col items-start justify-between gap-8 md:flex-row md:items-end">
                <div className="w-full max-w-2xl space-y-4">
                    <SkeletonLine width="18rem" height="h-10 md:h-12" />
                    <SkeletonLine height="h-5" />
                </div>
                <SkeletonLine width="24rem" height="h-16" className="max-w-sm rounded-card" />
            </header>

            <ServersGridSkeleton />
        </>
    );
}
