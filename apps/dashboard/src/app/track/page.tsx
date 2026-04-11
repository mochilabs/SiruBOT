"use client";

import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { ListMusicIcon, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import Container from "@/components/container";
import { Pagination } from "@/components/pagination";
import { SearchInput } from "@/components/search-input";
import { TrackList } from "@/components/track";

const fetcher = (url: string) => fetch(url).then((res) => {
    if (!res.ok) throw new Error("Network response was not ok");
    return res.json();
});

const PAGE_SIZE = 50;

export default function TrackPage() {
    const searchParams = useSearchParams();
    const query = searchParams.get("query") || "";
    const page = searchParams.get("page") || "1";

    const { data, error, isLoading } = useSWR(
        `/api/tracks?query=${encodeURIComponent(query)}&page=${page}`,
        fetcher,
        {
            revalidateOnFocus: false,
            dedupingInterval: 5000,
        }
    );

    const tracks = data?.tracks || [];
    const totalCount = data?.totalCount || 0;
    const totalPlaybacks = data?.totalPlaybacks?._sum?.totalPlays || 0;
    const totalPages = data?.totalPages || 0;
    const currentPage = parseInt(page);
    const rankOffset = (currentPage - 1) * PAGE_SIZE;

    if (error) {
        return (
            <Container>
                <div className="glass-panel p-20 text-center border-red-500/20 shadow-xl">
                    <p className="text-xl font-medium text-red-400">데이터를 불러오는데 실패했습니다.</p>
                    <button onClick={() => window.location.reload()} className="mt-4 text-primary font-bold">새로고침</button>
                </div>
            </Container>
        );
    }

    return (
        <Container>
            <motion.header 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mb-10 space-y-8 pb-8 border-b border-border/40 relative"
            >
                <div className="space-y-6">
                    <AnimatePresence mode="wait">
                        <motion.div 
                            key={query ? "search-badge" : "rank-badge"}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-primary/5 dark:bg-primary/10 border border-primary/20 text-primary text-sm font-bold shadow-sm"
                        >
                            <ListMusicIcon size={16} />
                            <span className="tracking-tight">{query ? `'${query}' 검색 결과` : "실시간 뮤직 차트"}</span>
                        </motion.div>
                    </AnimatePresence>
                    
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                        <div className="space-y-4">
                            <AnimatePresence mode="wait">
                                <motion.h1 
                                    key={query ? "search-title" : "rank-title"}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.3, ease: "easeOut" }}
                                    className="text-5xl md:text-6xl font-black tracking-tighter text-title-gradient leading-[0.9] py-1"
                                >
                                    {query ? '검색 결과' : '재생 순위'}
                                </motion.h1>
                            </AnimatePresence>
                            
                            <AnimatePresence mode="wait">
                                <motion.p 
                                    key={query ? "search-desc" : "rank-desc"}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.4 }}
                                    className="text-xl font-medium text-muted-foreground/80 leading-relaxed max-w-2xl"
                                >
                                    {query ? (
											<>시루봇이 재생한 적 있는 노래의<br /> 검색 결과를 보여드려요.</>
										) : (
											<>시루봇에서 가장 사랑받는 노래들을 모았어요.</>
                                    )}
                                </motion.p>
                            </AnimatePresence>
                        </div>
                    </div>
                </div>

                <div className="max-w-full flex flex-col gap-6 lg:flex-row lg:items-center">
                    <div className="flex-1">
                        <SearchInput />
                    </div>
                    <div className="flex gap-3 justify-start md:justify-end h-14">
                        <motion.div 
                            layout
                            className="group relative glass-panel h-14 px-6 flex flex-col justify-center items-center border-border/50 hover:border-primary/20 transition-colors cursor-help flex-1 md:flex-none md:min-w-[140px]"
                        >
                            <div className="flex items-center gap-1.5 text-primary/60">
                                <span className="text-[10px] font-black tracking-widest uppercase">
                                    {query ? "검색 결과 수" : "단일 곡 수"}
                                </span>
                            </div>
                            <span className="text-xl font-black text-foreground leading-[1.1] tabular-nums">
                                {isLoading ? "---" : totalCount.toLocaleString()}
                            </span>
                        </motion.div>

                        <motion.div 
                            layout
                            className="group relative glass-panel h-14 px-6 flex flex-col justify-center items-center border-border/50 hover:border-primary/20 transition-colors cursor-help flex-1 md:flex-none md:min-w-[140px]"
                        >
                            <div className="flex items-center gap-1.5 text-primary/60">
                                <span className="text-[10px] font-black tracking-widest uppercase">재생 횟수</span>
                            </div>
                            <span className="text-xl font-black text-foreground leading-[1.1] tabular-nums">
                                {isLoading ? "---" : totalPlaybacks.toLocaleString()}
                            </span>
                        </motion.div>
                    </div>
                </div>
            </motion.header>

            <section className="space-y-6 min-h-[500px] relative">
                <AnimatePresence mode="wait">
                    {isLoading ? (
                        <motion.div 
                            key="loading"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 flex flex-col items-center justify-center gap-4 py-24"
                        >
                            <Loader2 className="h-12 w-12 animate-spin text-primary/40" />
                            <p className="text-lg font-bold text-muted-foreground/60 animate-pulse tracking-tight">차트 정보를 불러오는 중...</p>
                        </motion.div>
                    ) : tracks.length === 0 ? (
                        <motion.div 
                            key="empty"
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            className="glass-panel p-20 text-center border-dashed border-border/50 shadow-sm"
                        >
                            <p className="text-xl font-medium text-muted-foreground">
                                {query ? "노래를 찾을 수 없어요." : "차트 데이터를 모으고 있어요..."}
                            </p>
                        </motion.div>
                    ) : (
                        <motion.div 
                            key="list"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.4 }}
                            className="space-y-10"
                        >
                            <TrackList tracks={tracks} rankOffset={rankOffset} />
                            <Pagination 
                                currentPage={currentPage} 
                                totalPages={totalPages} 
                                basePath="/track" 
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </section>
        </Container>
    );
}


