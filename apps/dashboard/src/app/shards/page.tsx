"use client";

import { m } from "framer-motion";
import { RadioTower } from "lucide-react";
import useSWR from "swr";

import Container from "@/components/container";
import { DataApiSection } from "@/components/data-api-section";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/primitives/empty-state";
import { ProcessCard } from "@/components/process-card";
import { ShardStats } from "@/components/shard-stats";
import { Badge } from "@/components/ui/badge";
import { VoiceServerHistory } from "@/components/voice-server-history";
import { VoiceServerSection } from "@/components/voice-server-section";
import type { ShardsResponse } from "@/lib/shard-api";

export default function ShardsPage() {
    const { data, error, isLoading, isValidating, mutate } = useSWR<ShardsResponse>("/api/shards", {
        refreshInterval: 11000,
        revalidateOnFocus: true,
        dedupingInterval: 2000,
    });

    // 폴링 실패 처리 — 마지막 정상 데이터가 있으면 화면을 유지해요:
    // 일시적인 네트워크 오류로 실시간 대시보드 전체가 에러 페이지로 튀는 것보다,
    // 마지막 정보를 계속 보여 주고 조용한 배지로 상태를 알리는 편이 낫기 때문이에요.
    // 최초 로드 실패(데이터 없음)일 때만 라우트 에러 페이지(app/error.tsx)로 넘겨요.
    const initialLoadFailed = (error || (data && "error" in data)) && !data;
    if (initialLoadFailed && !isValidating) {
        throw new Error("샤드 매니저와 연결하지 못했어요. 서버가 점검 중이거나 오프라인 상태일 수 있어요.", {
            cause: error ?? data
        });
    }

    const pollFailed = Boolean(error || (data && "error" in data)) && Boolean(data);

    if (isLoading) return null; // 라우트 loading.tsx 스켈레톤이 자리를 채워요.

    if (!data) return null;
    const { processes, stats } = data;

    return (
        <Container>
            <div className="relative overflow-visible">
                <PageHeader
                    title="시스템 상태"
                    description={
                        pollFailed
                            ? "동기화 실패 · 마지막 정보를 표시하는 중이에요."
                            : isValidating
                              ? "샤드 정보를 동기화하는 중이에요."
                              : "시루봇 서버의 상태를 실시간으로 확인할 수 있어요."
                    }
                >
                    {pollFailed && (
                        <div className="flex items-center gap-2">
                            <Badge variant="warning" dot>
                                동기화 실패 · 마지막 정보를 표시하는 중
                            </Badge>
                            <button
                                type="button"
                                onClick={() => mutate()}
                                className="text-sm font-medium text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-control px-2 py-1"
                            >
                                다시 시도
                            </button>
                        </div>
                    )}
                </PageHeader>
                <div className="grid gap-8">
                    <section>
                        <ShardStats stats={stats} />
                    </section>

                    <DataApiSection />

                    <VoiceServerSection />

                    <VoiceServerHistory />

                    <section className="space-y-8">
                        <div className="flex items-center gap-6">
                            <h2 className="text-lg font-bold text-foreground">
                                연동된 프로세스 <span className="text-primary-text ml-1">({processes.length})</span>
                            </h2>
                            <div className="h-px flex-1 bg-border-subtle" />
                        </div>

                        {processes.length === 0 ? (
                            <EmptyState
                                icon={RadioTower}
                                title="지금은 활성화된 피드가 없어요."
                                description="샤드 매니저로부터의 생존 신호를 기다리고 있어요."
                            />
                        ) : (
                            <div className="grid gap-8 md:grid-cols-2">
                                {processes.map((process, index) => (
                                    <m.div
                                        key={process.wsId}
                                        initial={{ opacity: 0, y: 20 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true, margin: "-50px" }}
                                        transition={{ duration: 0.4, delay: index * 0.05 }}
                                    >
                                        <ProcessCard process={process} index={index} />
                                    </m.div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </Container>
    );
}