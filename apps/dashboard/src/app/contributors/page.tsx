import Image from "next/image";
import { Users } from "lucide-react";

import Container from "@/components/container";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/primitives/empty-state";
import { Card } from "@/components/ui/card";

const REPO = "mochiLabs/SiruBOT";

export const metadata = {
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

export default async function ContributorsPage() {
  let contributors: Contributor[] = [];
  let failed = false;
  try {
    contributors = await fetchContributors();
  } catch (error) {
    console.error("[contributors] GitHub 목록 조회 실패", error);
    failed = true;
  }

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
        <>
          <p className="px-1 text-sm font-medium text-muted-foreground">
            총 {contributors.length}명이 {totalContributions.toLocaleString()}번의 기여로 함께 만들었어요.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {contributors.map((contributor) => (
              <a
                key={contributor.login}
                href={contributor.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-w-0 flex-col items-center gap-2 rounded-card bg-surface-2 px-4 py-5 text-center transition-colors duration-fast hover:bg-surface-1"
              >
                <Image
                  src={contributor.avatar_url}
                  alt={`${contributor.login} 프로필`}
                  width={56}
                  height={56}
                  className="h-14 w-14 rounded-full object-cover ring-4 ring-primary/10"
                  unoptimized
                />
                <p className="w-full truncate text-sm font-bold text-foreground">{contributor.login}</p>
                <p className="text-2xs tabular-nums text-muted-foreground">{contributor.contributions.toLocaleString()}회 기여</p>
              </a>
            ))}
          </div>
        </>
      )}
    </Container>
  );
}