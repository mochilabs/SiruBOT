"use client";

import { Moon, Sparkles } from "lucide-react";
import useSWR from "swr";

import type { OhaasaProxyResponse } from "@/app/api/ohaasa/route";
import { Badge } from "@/components/primitives/badge";
import { Card } from "@/components/primitives/card";
import { EmptyState } from "@/components/primitives/empty-state";
import { SkeletonCard } from "@/components/primitives/skeleton";
import { toError } from "@/lib/api-error";
import { cn } from "@/lib/utils";

/* ─────────────────────────── 헬퍼 ─────────────────────────── */

function sourceLabel(source: string): string {
  if (source === "ohaasa") return "아사히";
  if (source === "tv-asahi") return "TV 아사히";
  return source;
}

/* ─────────────────────────── 별자리 카드 ─────────────────────────── */

function HoroscopeCard({
  horoscope,
  highlighted,
}: {
  horoscope: OhaasaProxyResponse["horoscopes"][number];
  highlighted: boolean;
}) {
  return (
    <Card
      padding="sm"
      className={cn(
        "border-border/60 bg-surface-1",
        highlighted && "border-primary",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-bold text-foreground">
          {horoscope.zodiac.ko}
        </p>
        <Badge variant={highlighted ? "primary" : "default"} size="sm">
          {highlighted ? "내 별자리" : `${horoscope.rank}위`}
        </Badge>
      </div>
      <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
        {horoscope.content || "운세 내용이 없어요."}
      </p>
      {horoscope.lucky && (
        <Badge size="sm" className="self-start">
          {horoscope.lucky}
        </Badge>
      )}
    </Card>
  );
}

/* ─────────────────────────── 위젯 ─────────────────────────── */

export function OhaasaWidget({ zodiacCode }: { zodiacCode?: string | null }) {
  const { data, error, isLoading } = useSWR<OhaasaProxyResponse>("/api/ohaasa", {
    // 운세는 하루 1회 갱신 데이터라 자주 폴링할 필요가 없어요.
    refreshInterval: 30 * 60_000,
  });

  if (error) {
    const apiError = toError(error, "운세를 불러올 수 없어요.");
    return (
      <Card padding="md">
        <EmptyState icon={Moon} size="sm" title="운세를 불러올 수 없어요" description={apiError.message} />
      </Card>
    );
  }
  if (isLoading || !data) {
    return <SkeletonCard lines={3} />;
  }

  const mine = data.horoscopes.find((item) => item.zodiacCode === zodiacCode);
  const others = data.horoscopes.filter((item) => item.zodiacCode !== zodiacCode);
  const ordered = mine ? [mine, ...others] : data.horoscopes;

  if (ordered.length === 0) {
    return (
      <Card padding="md">
        <EmptyState icon={Moon} size="sm" title="운세를 불러올 수 없어요" description="오늘의 운세 데이터가 아직 준비되지 않았어요." />
      </Card>
    );
  }

  return (
    <Card padding="lg" className="gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Sparkles size={16} className="text-primary" />
          오늘의 운세
        </h2>
        <div className="flex items-center gap-2">
          {data.translated ? null : <Badge variant="warning" size="sm">일본어 원문</Badge>}
          <Badge size="sm">{data.date}</Badge>
          <Badge variant="info" size="sm">
            {sourceLabel(data.source)}
          </Badge>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ordered.map((horoscope) => (
          <HoroscopeCard
            key={horoscope.zodiacCode}
            horoscope={horoscope}
            highlighted={horoscope.zodiacCode === zodiacCode}
          />
        ))}
      </div>
    </Card>
  );
}