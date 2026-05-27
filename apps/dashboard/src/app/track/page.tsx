"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ListMusicIcon } from "lucide-react";
import useSWR from "swr";

import Container from "@/components/container";
import { ErrorPanel } from "@/components/error-panel";
import Loader from "@/components/loader";
import { Pagination } from "@/components/pagination";
import { SearchInput } from "@/components/search-input";
import { TrackList } from "@/components/track";
import { PageHeader } from "@/components/layout/page-header";
import { PAGE_SIZE } from "@/lib/track-constants";

function TrackContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get("query") || "";
  const page = searchParams.get("page") || "1";

  const { data, error, isLoading, mutate } = useSWR(
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
        <div className="pt-20">
          <ErrorPanel 
            title="차트 오류" 
            message="데이터를 불러오지 못했어요." 
            onRetry={() => mutate()} 
          />
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <PageHeader
        badge={query ? `'${query}' 검색 결과` : "실시간 뮤직 차트"}
        badgeIcon={<ListMusicIcon size={16} />}
        title={query ? "검색 결과" : "재생 순위"}
        description={
          query ? (
            <>시루봇이 재생한 적 있는 노래의 검색 결과를 보여드려요.</>
          ) : (
            <>시루봇에서 가장 사랑받는 노래들을 모았어요.</>
          )
        }
      >
        <div className="w-full flex flex-col sm:flex-row gap-3 sm:gap-6 lg:items-center">
          <div className="w-full flex-1">
            <SearchInput />
          </div>
          <div className="flex w-full sm:w-auto gap-2 sm:gap-3 h-14 sm:h-14">
            <div className="group relative glass-panel h-full px-3 sm:px-6 flex flex-col justify-center items-center border-border/50 hover:border-primary/20 transition-colors cursor-help flex-1 sm:flex-none sm:min-w-[140px]">
              <div className="flex items-center gap-1.5 text-primary/60">
                <span className="text-[10px] sm:text-xs font-black tracking-widest uppercase">
                  {query ? "검색 결과 수" : "단일 곡 수"}
                </span>
              </div>
              <span className="text-base sm:text-xl font-black text-foreground leading-[1.1] tabular-nums">
                {isLoading ? "---" : totalCount.toLocaleString()}
              </span>
            </div>

            <div className="group relative glass-panel h-full px-3 sm:px-6 flex flex-col justify-center items-center border-border/50 hover:border-primary/20 transition-colors cursor-help flex-1 sm:flex-none sm:min-w-[140px]">
              <div className="flex items-center gap-1.5 text-primary/60">
                <span className="text-[10px] sm:text-xs font-black tracking-widest uppercase">
                  재생 횟수
                </span>
              </div>
              <span className="text-base sm:text-xl font-black text-foreground leading-[1.1] tabular-nums">
                {isLoading ? "---" : totalPlaybacks.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </PageHeader>

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

export default function TrackPage() {
  return (
    <Suspense fallback={<Container><Loader fullPage /></Container>}>
      <TrackContent />
    </Suspense>
  );
}
