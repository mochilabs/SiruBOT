"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import useSWR from "swr";

import Container from "@/components/container";
import { ErrorPanel } from "@/components/error-panel";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/pagination";
import { EmptyState } from "@/components/primitives/empty-state";
import { SearchInput } from "@/components/search-input";
import { TrackList, TrackListSkeleton } from "@/components/track";
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
  const parsedPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const page = String(Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1);
  const period = parsePeriod(searchParams.get("period"));
  const periodInfo = PERIODS.find((p) => p.value === period)!;

  const { data, error, isLoading, isValidating, mutate } = useSWR<ChartPage>(
    `/api/tracks?period=${period}&query=${encodeURIComponent(query)}&page=${page}`,
    { keepPreviousData: true },
  );
  const loading = isLoading;

  const entries = data?.entries || [];
  const totalCount = data?.totalCount || 0;
  const totalPlaybacks = data?.totalPlays || 0;
  const totalPages = data?.totalPages || 0;
  const currentPage = Number(page);

  if (error && !data) {
    return (
      <Container>
        <ErrorPanel title="차트 오류" message="데이터를 불러오지 못했어요." onRetry={() => mutate()} />
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
        <div className="w-full flex flex-col lg:flex-row gap-3 lg:items-center">
          <div className="w-full flex-1 min-w-0">
            <SearchInput />
          </div>
          <div className="flex items-center justify-between gap-3">
            <PeriodSelector value={period} />
            <p className="shrink-0 text-sm font-medium text-muted-foreground tabular-nums" aria-live="polite">
              {query ? "결과" : "곡"}{" "}
              <span className="font-extrabold text-primary-text">{loading ? "–" : totalCount.toLocaleString()}</span>
              <span className="mx-1.5" aria-hidden>·</span>
              {periodInfo.plays}{" "}
              <span className="font-extrabold text-primary-text">{loading ? "–" : totalPlaybacks.toLocaleString()}</span>
            </p>
          </div>
        </div>
      </PageHeader>

      <section
        className={`space-y-6 min-h-[500px] relative transition-opacity duration-fast ${!loading && isValidating ? "opacity-60" : ""}`}
        aria-busy={loading || isValidating}
      >
        {error && data && (
          <ErrorPanel title="차트 오류" message="최신 데이터를 불러오지 못했어요." onRetry={() => mutate()} />
        )}
        {loading ? (
          <TrackListSkeleton />
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
    <Suspense
      fallback={
        <Container>
          <TrackListSkeleton />
        </Container>
      }
    >
      <TrackContent />
    </Suspense>
  );
}
