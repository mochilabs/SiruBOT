"use client";

import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { ListMusicIcon } from "lucide-react";

import Container from "@/components/container";
import Loader from "@/components/loader";
import { Pagination } from "@/components/pagination";
import { SearchInput } from "@/components/search-input";
import { TrackList } from "@/components/track";
import { PAGE_SIZE } from "@/lib/track-constants";

export default function TrackPage() {
  const searchParams = useSearchParams();
  const query = searchParams.get("query") || "";
  const page = searchParams.get("page") || "1";

  const { data, error, isLoading } = useSWR(
    `/api/tracks?query=${encodeURIComponent(query)}&page=${page}`,
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
          <p className="text-xl font-medium text-red-400">
            데이터를 불러오지 못했어요.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 text-primary font-bold"
          >
            새로고침
          </button>
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <header className="mb-4 sm:mb-8 space-y-4 sm:space-y-4 pb-4 sm:pb-8 border-b border-border/40 relative">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-primary/5 dark:bg-primary/10 border border-primary/20 text-primary text-sm font-bold shadow-sm">
            <ListMusicIcon size={16} />
            <span className="tracking-tight">
              {query ? `'${query}' 검색 결과` : "실시간 뮤직 차트"}
            </span>
          </div>

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-4">
              <h1 className="text-5xl md:text-6xl font-black tracking-tighter text-title-gradient leading-[0.9] py-1">
                {query ? "검색 결과" : "재생 순위"}
              </h1>

              <p className="text-xl font-medium text-muted-foreground/80 leading-relaxed max-w-2xl">
                {query ? (
                  <>시루봇이 재생한 적 있는 노래의 검색 결과를 보여드려요.</>
                ) : (
                  <>시루봇에서 가장 사랑받는 노래들을 모았어요.</>
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="max-w-full flex flex-col sm:flex-row gap-4 sm:gap-6 lg:items-center">
          <SearchInput className="flex-1" />
          <div className="flex gap-2 sm:gap-3 justify-start md:justify-end h-12 sm:h-14">
            <div className="group relative glass-panel h-full px-4 sm:px-6 flex flex-col justify-center items-center border-border/50 hover:border-primary/20 transition-colors cursor-help flex-1 md:flex-none md:min-w-[120px] sm:min-w-[140px]">
              <div className="flex items-center gap-1.5 text-primary/60">
                <span className="text-[9px] sm:text-[10px] font-black tracking-widest uppercase">
                  {query ? "검색 결과 수" : "단일 곡 수"}
                </span>
              </div>
              <span className="text-lg sm:text-xl font-black text-foreground leading-[1.1] tabular-nums">
                {isLoading ? "---" : totalCount.toLocaleString()}
              </span>
            </div>

            <div className="group relative glass-panel h-full px-4 sm:px-6 flex flex-col justify-center items-center border-border/50 hover:border-primary/20 transition-colors cursor-help flex-1 md:flex-none md:min-w-[120px] sm:min-w-[140px]">
              <div className="flex items-center gap-1.5 text-primary/60">
                <span className="text-[9px] sm:text-[10px] font-black tracking-widest uppercase">
                  재생 횟수
                </span>
              </div>
              <span className="text-lg sm:text-xl font-black text-foreground leading-[1.1] tabular-nums">
                {isLoading ? "---" : totalPlaybacks.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </header>

      <section className="space-y-6 min-h-[500px] relative">
        {isLoading ? (
          <Loader text="차트 정보를 불러오는 중..." />
        ) : tracks.length === 0 ? (
          <div className="glass-panel p-20 text-center border-dashed border-border/50 shadow-sm">
            <p className="text-xl font-medium text-muted-foreground">
              {query
                ? "노래를 찾을 수 없어요."
                : "차트 데이터를 모으고 있어요..."}
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            <TrackList tracks={tracks} rankOffset={rankOffset} />
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              basePath="/track"
            />
          </div>
        )}
      </section>
    </Container>
  );
}
