import type { Metadata } from "next";
import Image from "next/image";
import { Users } from "lucide-react";

import Container from "@/components/container";
import { CommitHeatmapGrid, CommitHeatmapLegend } from "@/components/contributors/commit-heatmap-grid";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/primitives/empty-state";
import { Card } from "@/components/ui/card";

const REPO = "mochiLabs/SiruBOT";

export const metadata: Metadata = {
  title: "기여자 | 시루봇",
  description: "시루봇을 함께 만들어 나가는 모든 기여자를 소개해요.",
};

/** GitHub 기여자 응답에서 쓰는 필드만 골라요 */
interface Contributor {
  login: string;
  avatar_url: string;
  html_url: string;
  contributions: number;
  type: string;
}

/** 주간 커밋 통계(stats/commit_activity)의 한 주 — days는 일~토 7칸이에요 */
interface CommitWeek {
  week: number;
  days: number[];
}

async function fetchContributors(): Promise<Contributor[]> {
  const all: Contributor[] = [];
  // per_page 100의 최대 10페이지를 넘어보며 전체 기여자를 모아요 ("전부" 요약)
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(`https://api.github.com/repos/${REPO}/contributors?per_page=100&page=${page}`, {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(`contributors request failed: ${res.status}`);
    const batch = (await res.json()) as Contributor[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

/**
 * 최근 1년 주간 커밋 통계. GitHub stats API는 첫 요청에 202(계산 중)를 줘요 —
 * 한 번 재시도하고 여전히 준비 안 됐으면 null을 돌려 히트맵만 숨겨요(fail-open).
 */
async function fetchCommitActivity(): Promise<CommitWeek[] | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`https://api.github.com/repos/${REPO}/stats/commit_activity`, {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 86400 },
    });
    if (res.status === 202) continue;
    if (!res.ok) return null;
    const weeks = (await res.json()) as CommitWeek[];
    if (Array.isArray(weeks) && weeks.length > 0) return weeks;
    return null;
  }
  return null;
}


function CommitHeatmap({ weeks }: { weeks: CommitWeek[] }) {
  const total = weeks.reduce((sum, week) => sum + week.days.reduce((a, b) => a + b, 0), 0);
  const startDate = new Date(weeks[0].week * 1000);
  const endDate = new Date((weeks[weeks.length - 1].week + 6 * 86400) * 1000);
  const fmt = (d: Date) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;

  return (
    <Card padding="lg">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-foreground">지난 1년 커밋</h2>
        <p className="text-xs tabular-nums text-muted-foreground">
          총 {total.toLocaleString()}커밋 · {fmt(startDate)} ~ {fmt(endDate)}
        </p>
      </div>
      {/* 가로 스크롤은 이 히트맵 안에만 — 페이지 오버플로우로 새지 않게.
          모바일 초기 뷰는 최신 주(오른쪽 끝)에 맞춰요(클라이언트 ref 스크롤). */}
      <CommitHeatmapGrid weeks={weeks} />
      {/* 범례 — 색만으로 상태를 전달하지 않게 텍스트 병행 */}
      <div className="mt-3 flex items-center gap-2 text-2xs text-muted-foreground">
        <span>적음</span>
        <CommitHeatmapLegend />
        <span>많음</span>
      </div>
    </Card>
  );
}

export default async function ContributorsPage() {
  let contributors: Contributor[] = [];
  let failed = false;
  try {
    contributors = await fetchContributors();
  } catch (error) {
    console.error("[contributors] GitHub 목록 조회 실패", error);
    failed = true;
  }
  const commitWeeks = await fetchCommitActivity().catch(() => null);

  const totalContributions = contributors.reduce((sum, entry) => sum + entry.contributions, 0);

  return (
    <Container>
      <PageHeader
        title="기여자"
        description="코드·문서·기획으로 시루봇을 함께 만들어 나가는 모든 기여자를 소개해요."
      />

      {failed ? (
        <Card padding="lg" className="gap-3">
          <Users size={20} className="text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium text-foreground">기여자 목록을 불러오지 못했어요.</p>
          <p className="text-sm text-muted-foreground">GitHub 상태나 네트워크를 확인한 뒤 새로고침해 주세요.</p>
          <a
            href={`https://github.com/${REPO}/graphs/contributors`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-sm font-semibold text-primary-text hover:underline"
          >
            GitHub에서 기여자 그래프 보기
          </a>
        </Card>
      ) : contributors.length === 0 ? (
        <EmptyState
          title="아직 기여자 목록이 비어 있어요."
          description="첫 기여가 기록되면 여기에 소개돼요."
        />
      ) : (
        <div className="space-y-6">
          {commitWeeks && <CommitHeatmap weeks={commitWeeks} />}

          <Card padding="none">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-5 py-4">
              <h2 className="text-base font-bold text-foreground">
                기여자 {contributors.length}명
              </h2>
              <p className="text-xs tabular-nums text-muted-foreground">
                총 {totalContributions.toLocaleString()}번의 기여
              </p>
            </div>
            <ul className="divide-y divide-border-subtle">
              {contributors.map((contributor, index) => (
                <li key={contributor.login}>
                  <a
                    href={contributor.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-14 items-center gap-3 px-5 py-3 transition-colors duration-fast hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="w-6 shrink-0 text-right text-sm tabular-nums text-muted-foreground" aria-hidden>
                      {index + 1}
                    </span>
                    <Image
                      src={contributor.avatar_url}
                      alt={`${contributor.login} 프로필`}
                      width={32}
                      height={32}
                      className="size-8 shrink-0 rounded-full object-cover ring-2 ring-primary/10"
                      unoptimized
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-foreground" title={contributor.login}>
                      {contributor.login}
                    </span>
                    {contributor.type === "Bot" && (
                      <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-semibold text-muted-foreground">
                        봇
                      </span>
                    )}
                    <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                      {contributor.contributions.toLocaleString()}회
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </Container>
  );
}