"use client";

import { Activity, Ban, Database, Gauge, Network, TriangleAlert } from "lucide-react";
import useSWR from "swr";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
    const healthy = data.ok && data.redis;

    const metrics = [
        { label: "캐시 적중률", value: hitRate(data), detail: `${data.cache.redisHits + data.cache.memoryHits}회 적중`, icon: Gauge },
        { label: "외부 호출", value: totals.calls.toLocaleString(), detail: `오류 ${totals.errors.toLocaleString()}회`, icon: Network },
        { label: "재생 요청", value: Object.values(data.playback.counts).reduce((sum, count) => sum + count, 0).toLocaleString(), detail: "누적 이벤트", icon: Activity },
    ];

    return (
        <section className="space-y-4">
            <Card padding="md" className="gap-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary-text">
                            <Database size={19} aria-hidden />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-foreground">데이터 게이트웨이</h2>
                            <p className="text-sm text-muted-foreground">캐시와 외부 API 연동 상태</p>
                        </div>
                    </div>
                    <Badge variant={healthy ? "success" : "warning"} dot>
                        {healthy ? "정상" : data.ok ? "메모리 모드" : "확인 필요"}
                    </Badge>
                </div>

                <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-border-subtle pt-3 text-sm">
                    <span className="text-muted-foreground">Redis</span>
                    <span className="font-medium text-foreground">{data.redis ? "연결됨" : "메모리 캐시 사용 중"}</span>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                    {metrics.map(({ label, value, detail, icon: Icon }) => (
                        <div key={label} className="flex min-w-0 items-center gap-3 rounded-control bg-surface-2 p-3">
                            <Icon size={17} className="shrink-0 text-muted-foreground" aria-hidden />
                            <div className="min-w-0">
                                <p className="text-xs text-muted-foreground">{label}</p>
                                <p className="truncate text-lg font-bold tabular-nums text-foreground">{value}</p>
                                <p className="truncate text-xs text-muted-foreground">{detail}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </Card>

            {errors.length > 0 && (
                <Card padding="md" className="gap-3">
                    <h3 className="text-sm font-bold text-foreground">최근 재생 오류</h3>
                    <ul className="space-y-2 text-sm">
                        {errors.map((e, i) => (
                            <li key={`${e.at}-${i}`} className="flex min-w-0 items-start gap-2">
                                {e.type === "playback_abort" ? <Ban className="h-3.5 w-3.5 text-destructive shrink-0" aria-hidden /> : <TriangleAlert className="h-3.5 w-3.5 text-warning shrink-0" aria-hidden />}
                                <span className="min-w-0 break-words text-muted-foreground">
                                    <span className="font-medium text-foreground">{e.trackTitle ?? "알 수 없는 곡"}</span>
                                    {e.trackAuthor ? ` · ${e.trackAuthor}` : ""} · {e.reason ?? `오류 ${e.consecutiveErrors}회`}
                                </span>
                            </li>
                        ))}
                    </ul>
                </Card>
            )}

            {errors.length === 0 && (
                <p className="px-1 text-sm text-muted-foreground">최근 재생 오류가 없어요.</p>
            )}
        </section>
    );
}
