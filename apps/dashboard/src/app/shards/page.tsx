"use client";

import useSWR from "swr";
import { AlertTriangle, RadioTower } from "lucide-react";
import { motion } from "framer-motion";

import Container from "@/components/container";
import Loader from "@/components/loader";
import { ProcessCard } from "@/components/process-card";
import { ShardStats } from "@/components/shard-stats";
import type { ShardsResponse } from "@/lib/shard-api";

export default function ShardsPage() {
    const { data, error, isLoading, isValidating } = useSWR<ShardsResponse>("/api/shards", {
        refreshInterval: 11000,
        revalidateOnFocus: true,
        dedupingInterval: 2000,
    });

    if (error || (data && "error" in data)) {
        return (
            <Container>
                <div className="flex items-center justify-center min-h-[60vh]">
                    <section className="glass-panel p-12 text-center max-w-xl mx-auto border-red-500/20">
                        <div className="mx-auto mb-6 inline-flex rounded-2xl bg-red-500/10 p-4 border border-red-500/20">
                            <AlertTriangle className="h-8 w-8 text-red-400" />
                        </div>
                        <h1 className="text-3xl font-black tracking-tighter text-foreground mb-4">앗, 연결에 실패했어요</h1>
                        <p className="text-lg font-medium text-muted-foreground leading-relaxed">
                            샤드 매니저와 연결하지 못했어요. <br />
                            서버가 점검 중이거나 오프라인 상태일 수 있어요.
                        </p>
                    </section>
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
                    withBlur 
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
                <header className="mb-8 space-y-4 sm:space-y-4 pb-6 sm:pb-8 border-b border-border/40 relative">
                    <div className="flex flex-col mb-0 lg:flex-row items-start lg:items-end justify-between gap-8">
                        <div className="space-y-6 flex-1">
                            <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-primary/5 dark:bg-primary/10 border border-primary/20 text-primary text-sm font-bold shadow-sm shadow-primary/5">
                                <span className="relative flex h-2 w-2">
                                    <span className={isValidating ? "animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" : ""}></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                                </span>
                                <span className="tracking-tight">{isValidating ? "동기화 중..." : "실시간 모니터링"}</span>
                            </div>
                            
                            <div className="space-y-2">
                                <h1 className="text-5xl md:text-6xl font-black tracking-tighter text-title-gradient leading-[0.9] py-1">
                                    시스템 상태
                                </h1>
                                <p className="text-xl font-medium text-muted-foreground/80 leading-relaxed max-w-2xl">
                                    시루봇 서버의 상태를 확인할 수 있어요.
                                </p>
                            </div>
                        </div>
                    </div>
                    
                    <div className="absolute top-0 right-0 -z-10 w-[500px] h-[300px] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
                </header>

                <div className="grid gap-8">
                    <section>
                        <ShardStats stats={stats} />
                    </section>

                    <section className="space-y-8">
                        <div className="flex items-center gap-6">
                            <div className="h-[2px] w-12 bg-primary/40 rounded-full" />
                            <h2 className="text-3xl font-black tracking-tighter text-foreground whitespace-nowrap">
                                연동된 프로세스 <span className="text-primary/60 ml-1">({processes.length})</span>
                            </h2>
                            <div className="h-px flex-1 bg-linear-to-r from-border/80 to-transparent" />
                        </div>

                        {processes.length === 0 ? (
                            <div className="glass-panel p-24 text-center border-dashed border-border/80 bg-muted/5 group">
                                <div className="mx-auto mb-6 w-16 h-16 rounded-3xl bg-muted flex items-center justify-center border border-border group-hover:scale-110 transition-transform duration-500">
                                    <RadioTower size={32} className="text-muted-foreground" />
                                </div>
                                <p className="text-2xl font-black tracking-tight text-muted-foreground">지금은 활성화된 피드가 없어요.</p>
                                <p className="mt-2 text-muted-foreground/60 font-medium">샤드 매니저로부터의 생존 신호를 기다리고 있어요.</p>
                            </div>
                        ) : (
                            <div className="grid gap-8 md:grid-cols-2">
                                {processes.map((process, index) => (
                                    <motion.div
                                        key={process.wsId}
                                        initial={{ opacity: 0, y: 20 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true, margin: "-50px" }}
                                        transition={{ duration: 0.4, delay: index * 0.05 }}
                                    >
                                        <ProcessCard process={process} index={index} />
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </Container>
    );
}