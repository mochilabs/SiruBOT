"use client";

import { m } from "framer-motion";
import { RadioTower } from "lucide-react";
import useSWR from "swr";

import Container from "@/components/container";
import { DataApiSection } from "@/components/data-api-section";
import { ErrorPanel } from "@/components/error-panel";
import { PageHeader } from "@/components/layout/page-header";
import Loader from "@/components/loader";
import { EmptyState } from "@/components/primitives/empty-state";
import { ProcessCard } from "@/components/process-card";
import { ShardStats } from "@/components/shard-stats";
import type { ShardsResponse } from "@/lib/shard-api";

export default function ShardsPage() {
    const { data, error, isLoading, isValidating, mutate } = useSWR<ShardsResponse>("/api/shards", {
        refreshInterval: 11000,
        revalidateOnFocus: true,
        dedupingInterval: 2000,
    });

    if (error || (data && "error" in data)) {
        return (
            <Container>
                <div className="flex items-center justify-center min-h-[60vh]">
                    <ErrorPanel 
                        title="앗, 연결에 실패했어요" 
                        message="샤드 매니저와 연결하지 못했어요. 서버가 점검 중이거나 오프라인 상태일 수 있어요." 
                        onRetry={() => mutate()} 
                    />
                </div>
            </Container>
        );
    }

    if (isLoading) {
        return (
            <Container>
                <Loader 
                    fullPage 
                    size="xl" 
                    text="샤드 정보 불러오는 중" 
                    description="네트워크 상태에 따라 지연될 수 있어요." 
                />
            </Container>
        );
    }

    if (!data) return null;
    const { processes, stats } = data;

    return (
        <Container>
            <div className="relative overflow-visible">
                <PageHeader
                    title="시스템 상태"
                    description={isValidating ? "샤드 정보를 동기화하는 중이에요." : "시루봇 서버의 상태를 실시간으로 확인할 수 있어요."}
                />
                <div className="grid gap-8">
                    <section>
                        <ShardStats stats={stats} />
                    </section>

                    <DataApiSection />

                    <section className="space-y-8">
                        <div className="flex items-center gap-6">
                            <div className="h-[2px] w-12 bg-primary/40 rounded-full" />
                            <h2 className="text-3xl font-black tracking-tighter text-foreground whitespace-nowrap">
                                연동된 프로세스 <span className="text-primary-text ml-1">({processes.length})</span>
                            </h2>
                            <div className="h-px flex-1 bg-linear-to-r from-border/80 to-transparent" />
                        </div>

                        {processes.length === 0 ? (
                            <EmptyState
                                icon={RadioTower}
                                title="지금은 활성화된 피드가 없어요."
                                description="샤드 매니저로부터의 생존 신호를 기다리고 있어요."
                                className="border-border/80"
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