"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import useSWR from "swr";

import Container from "@/components/container";
import { ErrorPanel } from "@/components/error-panel";
import { PageHeader } from "@/components/layout/page-header";
import Loader from "@/components/loader";
import { Pagination } from "@/components/pagination";
import { EmptyState } from "@/components/primitives/empty-state";
import { SearchInput } from "@/components/search-input";
import { TrackList } from "@/components/track";
import { Button } from "@/components/ui/button";
import type { ChartPage, ChartPeriod } from "@/lib/track-chart";

const PERIODS: { value: ChartPeriod; label: string; plays: string; description: string }[] = [
  { value: "today", label: "오늘", plays: "24시간 재생", description: "최근 24시간 동안 많이 들은 노래예요." },
  { value: "week", label: "주간", plays: "주간 재생", description: "최근 7일 동안 많이 들은 노래예요." },
  { value: "month", label: "월간", plays: "월간 재생", description: "최근 30일 동안 많이 들은 노래예요." },
  { value: "all", label: "전체", plays: "총 재생", description: "시루봇이 지금까지 가장 많이 재생한 노래예요." },
];

function parsePeriod(value: string | null): ChartPeriod {
  return PERIODS.some((p) => p.value === value) ? (value as ChartPeriod) : "week";
}

/** 기간 선택 — URL ?period=로 유지해서 공유할 수 있어요. 바꾸면 1페이지로 돌아가요. */
function PeriodSelector({ value }: { value: ChartPeriod }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const select = (period: ChartPeriod) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", period);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex gap-1.5" role="group" aria-label="차트 기간">
      {PERIODS.map((p) => (
        <Button
          key={p.value}
          variant="state-toggle"
          size="sm"
          className="min-h-9 pointer-coarse:min-h-11 px-3"
          active={p.value === value}
          aria-pressed={p.value === value}
          onClick={() => select(p.value)}
        >
          {p.label}
        </Button>
      ))}
    </div>
  );
}

function TrackContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get("query") || "";
  const page = searchParams.get("page") || "1";
  const period = parsePeriod(searchParams.get("period"));
  const periodInfo = PERIODS.find((p) => p.value === period)!;

  // 차트는 로그인 없이 열려 있어요 — /api/tracks가 공개 읽기 전용이라 상태 게이트를 두지 않아요.
  // keepPreviousData: 재검색 동안 이전 목록을 유지해 로딩 스피너로 배경이 번쩍이는 걸 막아요.
  const { data, error, isLoading, mutate } = useSWR<ChartPage>(
    `/api/tracks?period=${period}&query=${encodeURIComponent(query)}&page=${page}`,
    { keepPreviousData: true },
  );
  const loading = isLoading;

  const entries = data?.entries || [];
  const totalCount = data?.totalCount || 0;
  const totalPlaybacks = data?.totalPlays || 0;
  const totalPages = data?.totalPages || 0;
  const currentPage = parseInt(page);

  if (error) {
    return (
      <Container>
        <ErrorPanel 
            title="차트 오류" 
            message="데이터를 불러오지 못했어요." 
            onRetry={() => mutate()} 
          />
      </Container>
    );
  }

  return (
    <Container>
      <PageHeader
        title={query ? "검색 결과" : `${periodInfo.label} 인기 차트`}
        description={
          query ? (
            <>시루봇이 재생한 적 있는 노래 중 {periodInfo.label} 차트의 검색 결과예요.</>
          ) : (
            <>{periodInfo.description}</>
          )
        }
      >
        <div className="w-full flex flex-col sm:flex-row gap-3 sm:gap-6 lg:items-center">
          <div className="w-full flex-1">
            <SearchInput />
          </div>
          <div className="flex w-full sm:w-auto gap-2 sm:gap-3 h-14 sm:h-14">
            <div className="bg-surface-1 rounded-card h-full px-3 sm:px-6 flex flex-col justify-center items-center transition-colors flex-1 sm:flex-none sm:min-w-[140px]">
              <div className="flex items-center gap-1.5 text-primary-text">
                <span className="text-xs font-black">
                  {query ? "검색 결과 수" : "곡 수"}
                </span>
              </div>
              <span className="text-base sm:text-xl font-black text-foreground leading-[1.1] tabular-nums">
                {loading ? "---" : totalCount.toLocaleString()}
              </span>
            </div>

            <div className="bg-surface-1 rounded-card h-full px-3 sm:px-6 flex flex-col justify-center items-center transition-colors flex-1 sm:flex-none sm:min-w-[140px]">
              <div className="flex items-center gap-1.5 text-primary-text">
                <span className="text-xs font-black">
                  {periodInfo.plays}
                </span>
              </div>
              <span className="text-base sm:text-xl font-black text-foreground leading-[1.1] tabular-nums">
                {loading ? "---" : totalPlaybacks.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </PageHeader>

      <div className="mb-4">
        <PeriodSelector value={period} />
      </div>

      <section className="space-y-6 min-h-[500px] relative">
        {loading ? (
          <Loader text="차트 정보를 불러오는 중..." />
        ) : entries.length === 0 ? (
          <EmptyState
            icon={Search}
            title={query ? "노래를 찾을 수 없어요." : "아직 이 기간에 재생된 곡이 없어요."}
            description={query ? undefined : "노래를 재생하면 순위가 집계돼요."}
          />
        ) : (
          <div className="space-y-10">
            <TrackList entries={entries} playsLabel={periodInfo.plays} />
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
