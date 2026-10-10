"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { LogIn, Search } from "lucide-react";
import useSWR from "swr";

import Container from "@/components/container";
import { ErrorPanel } from "@/components/error-panel";
import { PageHeader } from "@/components/layout/page-header";
import Loader from "@/components/loader";
import { Pagination } from "@/components/pagination";
import { buttonVariants } from "@/components/primitives/button";
import { EmptyState } from "@/components/primitives/empty-state";
import { SearchInput } from "@/components/search-input";
import { TrackList } from "@/components/track";
import { PAGE_SIZE } from "@/lib/track-constants";

function TrackContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get("query") || "";
  const page = searchParams.get("page") || "1";

  // /api/tracks는 로그인 필수라 비로그인이면 요청 자체를 막아요
  const { status } = useSession();
  const { data, error, isLoading, mutate } = useSWR(
    status === "authenticated"
      ? `/api/tracks?query=${encodeURIComponent(query)}&page=${page}`
      : null,
  );
  const loading = status === "loading" || isLoading;

  const tracks = data?.tracks || [];
  const totalCount = data?.totalCount || 0;
  const totalPlaybacks = data?.totalPlaybacks?._sum?.totalPlays || 0;
  const totalPages = data?.totalPages || 0;
  const currentPage = parseInt(page);
  const rankOffset = (currentPage - 1) * PAGE_SIZE;

  if (status === "unauthenticated") {
    return (
      <Container>
        <div className="pt-20">
          <EmptyState
            icon={LogIn}
            title="로그인이 필요해요."
            description="로그인하면 재생 순위와 곡 검색을 이용할 수 있어요."
            action={
              <Link
                href="/api/auth/signin?callbackUrl=/track"
                className={buttonVariants({ variant: "primary" })}
              >
                로그인하기
              </Link>
            }
          />
        </div>
      </Container>
    );
  }

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
            <div className="group relative bg-surface-1 border border-border-subtle rounded-card h-full px-3 sm:px-6 flex flex-col justify-center items-center hover:border-primary/20 transition-colors cursor-help flex-1 sm:flex-none sm:min-w-[140px]">
              <div className="flex items-center gap-1.5 text-primary-text">
                <span className="text-2xs sm:text-xs font-black">
                  {query ? "검색 결과 수" : "단일 곡 수"}
                </span>
              </div>
              <span className="text-base sm:text-xl font-black text-foreground leading-[1.1] tabular-nums">
                {loading ? "---" : totalCount.toLocaleString()}
              </span>
            </div>

            <div className="group relative bg-surface-1 border border-border-subtle rounded-card h-full px-3 sm:px-6 flex flex-col justify-center items-center hover:border-primary/20 transition-colors cursor-help flex-1 sm:flex-none sm:min-w-[140px]">
              <div className="flex items-center gap-1.5 text-primary-text">
                <span className="text-2xs sm:text-xs font-black">
                  재생 횟수
                </span>
              </div>
              <span className="text-base sm:text-xl font-black text-foreground leading-[1.1] tabular-nums">
                {loading ? "---" : totalPlaybacks.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </PageHeader>

      <section className="space-y-6 min-h-[500px] relative">
        {loading ? (
          <Loader text="차트 정보를 불러오는 중..." />
        ) : tracks.length === 0 ? (
          <EmptyState
            icon={Search}
            title={
              query
                ? "노래를 찾을 수 없어요."
                : "차트 데이터를 모으고 있어요..."
            }
          />
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
