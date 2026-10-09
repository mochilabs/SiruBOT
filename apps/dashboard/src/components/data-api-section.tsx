"use client";

import { Ban, TriangleAlert } from "lucide-react";
import useSWR from "swr";

import { EmptyState } from "@/components/primitives/empty-state";
import type { DataApiStatus } from "@/lib/data-api";

function hitRate(status: DataApiStatus): string {
    const hits = status.cache.redisHits + status.cache.memoryHits;
    const total = hits + status.cache.misses;
    if (total === 0) return "-";
    return `${Math.round((hits / total) * 100)}%`;
}

function upstreamTotals(status: DataApiStatus): { calls: number; errors: number } {
    return Object.values(status.routes).reduce(
        (acc, r) => ({ calls: acc.calls + r.upstreamCalls, errors: acc.errors + r.upstreamErrors }),
        { calls: 0, errors: 0 },
    );
}

export function DataApiSection() {
    const { data } = useSWR<DataApiStatus>("/api/data-api", {
        refreshInterval: 15000,
        dedupingInterval: 5000,
    });

    if (!data) return null;

    const totals = upstreamTotals(data);
    const errors = data.playback.recentErrors.slice(-5).reverse();

    return (
        <section className="space-y-8">
            <div className="flex items-center gap-6">
                <div className="h-[2px] w-12 bg-primary/40 rounded-full" />
                <h2 className="text-3xl font-black tracking-tighter text-foreground whitespace-nowrap">
                    데이터 게이트웨이
                </h2>
                <div className="h-px flex-1 bg-linear-to-r from-border/80 to-transparent" />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-border/80 p-4">
                    <div className="text-sm text-muted-foreground">상태</div>
                    <div className="text-xl font-bold">{data.redis ? "정상 가동 중" : "메모리 모드"}</div>
                </div>
                <div className="rounded-xl border border-border/80 p-4">
                    <div className="text-sm text-muted-foreground">캐시 적중률</div>
                    <div className="text-xl font-bold">{hitRate(data)}</div>
                </div>
                <div className="rounded-xl border border-border/80 p-4">
                    <div className="text-sm text-muted-foreground">외부 호출 / 오류</div>
                    <div className="text-xl font-bold">
                        {totals.calls} / {totals.errors}
                    </div>
                </div>
            </div>

            {errors.length > 0 && (
                <div className="rounded-xl border border-border/80 p-4">
                    <div className="text-sm text-muted-foreground mb-2">최근 재생 오류</div>
                    <ul className="space-y-1 text-sm">
                        {errors.map((e, i) => (
                            <li key={`${e.at}-${i}`} className="flex items-center gap-1.5">
                                {e.type === "playback_abort" ? <Ban className="h-3.5 w-3.5 text-destructive shrink-0" aria-hidden /> : <TriangleAlert className="h-3.5 w-3.5 text-warning shrink-0" aria-hidden />}
                                <span>
                                    {e.trackTitle ?? "알 수 없는 곡"}
                                    {e.trackAuthor ? ` · ${e.trackAuthor}` : ""} ({e.reason ?? `오류 ${e.consecutiveErrors}회`})
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {errors.length === 0 && (
                <EmptyState
                    title="재생 오류가 없어요."
                    description="재생 중 끊김이나 예외가 발생하면 여기에 표시돼요."
                    className="border-border/80"
                />
            )}
        </section>
    );
}
