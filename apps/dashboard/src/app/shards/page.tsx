"use client";

import useSWR from "swr";
import { AlertTriangle, RadioTower, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import Container from "@/components/container";
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
            <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 sm:px-6 lg:px-8 pt-32 pb-20">
                <section className="glass-panel p-12 text-center max-w-xl mx-auto border-red-500/20">
                    <motion.div 
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="mx-auto mb-6 inline-flex rounded-2xl bg-red-500/10 p-4 border border-red-500/20"
                    >
                        <AlertTriangle className="h-8 w-8 text-red-400" />
                    </motion.div>
                    <h1 className="text-3xl font-black tracking-tighter text-foreground mb-4">앗, 연결에 실패했어요</h1>
                    <p className="text-lg font-medium text-muted-foreground leading-relaxed">
                        샤드 매니저에 연결할 수 없어요. <br />
                        서버가 점검 중이거나 오프라인 상태일 수 있어요.
                    </p>
                </section>
            </main>
        );
    }

    if (isLoading) {
        return (
            <Container>
                <div className="flex flex-col h-[70vh] items-center justify-center gap-6">
                    <div className="relative">
                        <Loader2 className="h-16 w-16 animate-spin text-primary/40" />
                        <div className="absolute inset-0 blur-xl bg-primary/20 animate-pulse" />
                    </div>
                    <div className="text-center space-y-2">
                        <p className="text-xl font-black tracking-tight text-foreground/80 animate-pulse">샤드 정보를 호출하는 중</p>
                        <p className="text-sm text-muted-foreground font-medium">네트워크 상태에 따라 지연될 수 있어요.</p>
                    </div>
                </div>
            </Container>
        );
    }

    if (!data) return null;
    const { processes, stats } = data;

    return (
        <Container>
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="relative overflow-visible"
            >
                <header className="mb-12 space-y-8 pb-8 border-b border-border/40">
                    <div className="flex flex-col mb-0 lg:flex-row items-start lg:items-end justify-between gap-8">
                        <div className="space-y-6 flex-1">
                            <AnimatePresence mode="wait">
                                <motion.div 
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-primary/5 dark:bg-primary/10 border border-primary/20 text-primary text-sm font-bold shadow-sm shadow-primary/5"
                                >
                                    <span className="relative flex h-2 w-2">
                                        <span className={isValidating ? "animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" : ""}></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                                    </span>
                                    <span className="tracking-tight">{isValidating ? "동기화 중..." : "실시간 모니터링"}</span>
                                </motion.div>
                            </AnimatePresence>
                            
                            <div className="space-y-2">
                                <motion.h1 
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="text-5xl md:text-6xl font-black tracking-tighter text-title-gradient leading-[0.9] py-1"
                                >
                                    시스템 상태
                                </motion.h1>
                                <motion.p 
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.1 }}
                                    className="text-xl font-medium text-muted-foreground/80 leading-relaxed max-w-2xl"
                                >
                                    시루봇 서버의 상태를 확인할 수 있어요.
                                </motion.p>
                            </div>
                        </div>
                    </div>
                    
                    <div className="absolute top-0 right-0 -z-10 w-[500px] h-[300px] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
                </header>

                <div className="grid gap-16">
                    {/* 통계 섹션 */}
                    <motion.section
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.1, duration: 0.5 }}
                    >
                        <ShardStats stats={stats} />
                    </motion.section>

                    {/* 프로세스 리스트 섹션 */}
                    <motion.section 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.2, duration: 0.5 }}
                        className="space-y-8"
                    >
                        <div className="flex items-center gap-6">
                            <div className="h-[2px] w-12 bg-primary/40 rounded-full" />
                            <h2 className="text-3xl font-black tracking-tighter text-foreground whitespace-nowrap">
                                연동된 프로세스 <span className="text-primary/60 ml-1">({processes.length})</span>
                            </h2>
                            <div className="h-px flex-1 bg-gradient-to-r from-border/80 to-transparent" />
                        </div>

                        <AnimatePresence mode="popLayout">
                            {processes.length === 0 ? (
                                <motion.div 
                                    key="empty"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="glass-panel p-24 text-center border-dashed border-border/80 bg-muted/5 group"
                                >
                                    <div className="mx-auto mb-6 w-16 h-16 rounded-3xl bg-muted flex items-center justify-center border border-border group-hover:scale-110 transition-transform duration-500">
                                        <RadioTower size={32} className="text-muted-foreground" />
                                    </div>
                                    <p className="text-2xl font-black tracking-tight text-muted-foreground">현재 활성화된 프로세스 피드가 없습니다.</p>
                                    <p className="mt-2 text-muted-foreground/60 font-medium">샤드 매니저로부터의 생존 신호를 기다리고 있어요.</p>
                                </motion.div>
                            ) : (
                                <div className="grid gap-8 md:grid-cols-2">
                                    {processes.map((process, index) => (
                                        <motion.div
                                            key={process.wsId}
                                            layout
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ delay: index * 0.05 }}
                                        >
                                            <ProcessCard process={process} index={index} />
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </AnimatePresence>
                    </motion.section>
                </div>
            </motion.div>
        </Container>
    );
}