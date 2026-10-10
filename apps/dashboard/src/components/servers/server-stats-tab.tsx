"use client";

import { useState } from "react";
import { useInView } from "react-intersection-observer";
import { BarChart3, Music, Play, User } from "lucide-react";
import useSWR from "swr";

import type { StatsServerStatsResponse } from "@/app/api/servers/[id]/stats/route";
import { StatCard } from "@/components/data/stat-card";
import { Badge } from "@/components/primitives/badge";
import { Card } from "@/components/primitives/card";
import { EmptyState } from "@/components/primitives/empty-state";
import { SkeletonCard } from "@/components/primitives/skeleton";
import { Tabs } from "@/components/primitives/tabs";
import { toError } from "@/lib/api-error";

const RANGE_TABS = [
  { key: "1", label: "24시간" },
  { key: "7", label: "7일" },
  { key: "30", label: "30일" },
  { key: "safe", label: "전체" },
] as const;

type RangeKey = (typeof RANGE_TABS)[number]["key"];

function rangeLabel(range: RangeKey): string {
  return RANGE_TABS.find((item) => item.key === range)?.label ?? range;
}

function formatDate(iso: string): string {
  return iso.slice(0, 10).replaceAll("-", ".");
}

function requesterLabel(userId: string): string {
  return `사용자 ${userId.slice(0, 6)}…`;
}

/** 리스트 항목 스태거 간격(ms) — 10개 항목 기준 마지막 딜레이 405ms */
const STAGGER_STEP_MS = 45;
/** 막대 미세 스태거 간격(ms) — 30개(30일) 기준 마지막 딜레이 348ms */
const BAR_STAGGER_STEP_MS = 12;

/**
 * 뷰포트 진입(triggerOnce) + CSS 전환으로 등장시킨다 — track.tsx AnimatedTrackItem 패턴.
 * framer-motion 개별 래퍼 대신 사용 — 요소 수가 적고(≤10/30개) JS 오버헤드가 낮다.
 */
function useReveal() {
  return useInView({ triggerOnce: true, threshold: 0.05 });
}

function TopTrackList({ tracks }: { tracks: StatsServerStatsResponse["topTracks"] }) {
  const { ref, inView } = useReveal();

  if (tracks.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">집계된 트랙이 없어요.</p>
    );
  }

  return (
    <ol ref={ref} className="space-y-2">
      {tracks.map((track, index) => (
        <li
          key={track.trackId}
          className="flex items-center gap-3 rounded-card border border-border-subtle bg-surface-2 px-3 py-2"
          style={{
            opacity: inView ? 1 : 0,
            transform: inView ? "none" : "translateY(16px)",
            transition: `opacity var(--motion-base) var(--ease-out-expo) ${index * STAGGER_STEP_MS}ms, transform var(--motion-base) var(--ease-out-expo) ${index * STAGGER_STEP_MS}ms`,
          }}
        >
          <span className="w-5 shrink-0 text-center text-sm font-black tabular-nums text-muted-foreground">
            {index + 1}
          </span>
          {track.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={track.thumbnail}
              alt=""
              className="h-10 w-10 shrink-0 rounded-card border border-border object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card border border-border bg-surface-1 text-muted-foreground">
              <Music size={18} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{track.title}</p>
            <p className="truncate text-xs text-muted-foreground">{track.artist}</p>
          </div>
          <Badge variant="primary" size="sm">
            {track.count}회
          </Badge>
        </li>
      ))}
    </ol>
  );
}

function RequesterList({ requesters }: { requesters: StatsServerStatsResponse["topRequesters"] }) {
  const { ref, inView } = useReveal();

  if (requesters.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">집계된 요청자가 없어요.</p>
    );
  }

  return (
    <ol ref={ref} className="space-y-2">
      {requesters.map((requester, index) => (
        <li
          key={requester.userId}
          className="flex items-center gap-3 rounded-card border border-border-subtle bg-surface-2 px-3 py-2"
          style={{
            opacity: inView ? 1 : 0,
            transform: inView ? "none" : "translateY(16px)",
            transition: `opacity var(--motion-base) var(--ease-out-expo) ${index * STAGGER_STEP_MS}ms, transform var(--motion-base) var(--ease-out-expo) ${index * STAGGER_STEP_MS}ms`,
          }}
        >
          <span className="w-5 shrink-0 text-center text-sm font-black tabular-nums text-muted-foreground">
            {index + 1}
          </span>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface-1 text-muted-foreground">
            <User size={18} />
          </div>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {requesterLabel(requester.userId)}
          </p>
          <Badge size="sm">{requester.count}회</Badge>
        </li>
      ))}
    </ol>
  );
}

function DailyBars({ dailyCounts }: { dailyCounts: StatsServerStatsResponse["dailyCounts"] }) {
  const { ref, inView } = useReveal();

  if (dailyCounts.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">일별 재생 기록이 없어요.</p>
    );
  }

  const max = Math.max(...dailyCounts.map((entry) => entry.count));

  return (
    <div className="space-y-2">
      {/* 컨테이너 1회 트리거 + 인덱스 기반 transitionDelay 미세 스태거 (막대 30개 → 개별 useInView는 비용 과다) */}
      <div ref={ref} className="flex h-24 items-end gap-1">
        {dailyCounts.map((entry, index) => (
          <div
            key={entry.date}
            title={`${formatDate(entry.date)} · ${entry.count}회`}
            className="min-w-[0px] flex-1 origin-bottom rounded-t bg-primary/60"
            style={{
              height: `${max > 0 ? Math.max(4, (entry.count / max) * 100) : 4}%`,
              transform: inView ? "scaleY(1)" : "scaleY(0)",
              transition: `transform var(--motion-slow) var(--ease-out-expo) ${index * BAR_STAGGER_STEP_MS}ms`,
            }}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{formatDate(dailyCounts[0].date)}</span>
        <span>{formatDate(dailyCounts[dailyCounts.length - 1].date)}</span>
      </div>
    </div>
  );
}

function ServerStatsPanel({ guildId, range }: { guildId: string; range: RangeKey }) {
  const { data, error, isLoading } = useSWR<StatsServerStatsResponse>(
    guildId ? `/api/servers/${guildId}/stats?days=${range}` : null,
    {
      keepPreviousData: true,
    },
  );

  if (error) {
    const apiError = toError(error, "통계를 불러오지 못했어요.");
    return (
      <Card padding="lg">
        <EmptyState icon={BarChart3} title="통계를 불러오지 못했어요" description={apiError.message} />
      </Card>
    );
  }
  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <SkeletonCard lines={2} />
        <SkeletonCard lines={4} />
      </div>
    );
  }

  if (data.totalPlays === 0) {
    return (
      <Card padding="lg">
        <EmptyState
          icon={BarChart3}
          title="이 기간에 재생 기록이 없어요"
          description="기간을 바꾸거나, Discord에서 곡을 재생하면 통계가 쌓여요."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4 animate-page-in">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Play} label="총 재생" value={data.totalPlays} />
        <StatCard
          icon={BarChart3}
          label="재생한 날"
          value={`${data.dailyCounts.length}일`}
          sub={data.period.first && data.period.last ? `${formatDate(data.period.first)} ~ ${formatDate(data.period.last)}` : undefined}
        />
        <StatCard icon={Music} label="기간" value={rangeLabel(range)} />
      </div>

      <Card padding="lg" className="gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">많이 재생된 트랙</h3>
          <Badge variant="primary" size="sm">
            TOP {Math.min(data.topTracks.length, 10)}
          </Badge>
        </div>
        <TopTrackList tracks={data.topTracks} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card padding="lg" className="gap-4">
          <h3 className="text-sm font-bold text-foreground">요청자 순위</h3>
          <RequesterList requesters={data.topRequesters} />
        </Card>
        <Card padding="lg" className="gap-4">
          <h3 className="text-sm font-bold text-foreground">일별 재생</h3>
          <DailyBars dailyCounts={data.dailyCounts} />
        </Card>
      </div>
    </div>
  );
}

export default function ServerStatsTab({ guildId }: { guildId: string }) {
  const [range, setRange] = useState<RangeKey>("7");

  return (
    <div className="space-y-2">
      <Tabs
        aria-label="통계 기간 필터"
        className="mb-4"
        items={RANGE_TABS.map((item) => ({ key: item.key, label: item.label }))}
        value={range}
        onChange={(key) => setRange(key as RangeKey)}
      />
      <ServerStatsPanel guildId={guildId} range={range} />
    </div>
  );
}