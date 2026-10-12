import Link from "next/link";

import Container from "@/components/container";
import { PageHeader } from "@/components/layout/page-header";
import { LicenseList } from "@/components/licenses/license-list";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import licenseData from "@/generated/open-source-licenses.json";

export const metadata = {
  title: "오픈소스 라이선스 | 시루봇",
  description: "시루봇에 포함된 오픈소스 자산과 코드 의존성 전체 라이선스 고지예요.",
};

interface LicenseEntry {
  name: string;
  license: string;
  version: string;
  source: string;
  sourceLabel: string;
  usage: string;
  note?: string;
}

/** 레포에 자산으로 포함된 폰트·이모지 (npm 패키지가 아니라서 생성 목록 밖에 있어요) */
const bundledAssets: LicenseEntry[] = [
  {
    name: "Pretendard Variable",
    license: "SIL Open Font License 1.1",
    version: "v1.3.9 (Pretendard Variable woff2)",
    source: "https://github.com/orioncactus/pretendard",
    sourceLabel: "orioncactus/pretendard",
    usage: "대시보드 UI 폰트 (한 · 영)",
  },
  {
    name: "Pretendard JP Variable",
    license: "SIL Open Font License 1.1",
    version: "v1.3.9 (woff2 · ttf)",
    source: "https://github.com/orioncactus/pretendard",
    sourceLabel: "orioncactus/pretendard",
    usage: "일본어 한자 폴백 폰트 (대시보드 폴백 · 카드 렌더 공용)",
  },
  {
    name: "Twemoji",
    license: "CC-BY 4.0",
    version: "Twemoji v14 아트",
    source: "https://github.com/jdecked/twemoji",
    sourceLabel: "jdecked/twemoji",
    usage: "이모지 아트 (대시보드 이모지 폴백 · 카드 렌더)",
    note: "Copyright Twitter, Inc and other contributors. CC-BY 4.0의 출처 고지는 이 페이지로 이행해요.",
  },
  {
    name: "twemoji-colr",
    license: "Apache License 2.0 (+ 아트는 CC-BY 4.0)",
    version: "v0.7.0",
    source: "https://github.com/mozilla/twemoji-colr",
    sourceLabel: "mozilla/twemoji-colr",
    usage: "Twemoji를 COLR/CPAL 컬러 폰트로 변환한 빌드 (TwemojiMozilla.ttf)",
  },
];

export default function LicensesPage() {
  return (
    <Container>
      <PageHeader
        title="오픈소스 라이선스"
        description="시루봇에 포함된 오픈소스 자산과 코드 의존성 전체를 고지해요."
      />
      <div className="space-y-4">
        <Card padding="lg" className="gap-2">
          <h2 className="text-base font-black tracking-tight text-foreground">임베디드 자산</h2>
          <p className="text-sm text-muted-foreground">npm 패키지가 아니라 레포에 파일로 포함돼요.</p>
        </Card>
        {bundledAssets.map((entry) => (
          <Card key={entry.name} padding="lg" className="gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-black tracking-tight text-foreground">{entry.name}</h3>
              <Badge variant="primary" size="sm">
                {entry.license}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {entry.version} · 사용처: {entry.usage}
            </p>
            {entry.note && (
              <p className="rounded-card bg-surface-2 px-4 py-3 text-sm text-muted-foreground">
                {entry.note}
              </p>
            )}
            <a
              href={entry.source}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-sm font-semibold text-primary-control hover:underline"
            >
              {entry.sourceLabel}
            </a>
          </Card>
        ))}

        <LicenseList
          entries={licenseData.entries}
          summary={licenseData.groupSummary}
          total={licenseData.total}
        />

        <p className="px-1 text-xs text-muted-foreground">
          의존성 목록은 커밋된 생성 데이터예요. 패키지를 추가·제거하면{" "}
          <code className="rounded-control bg-muted px-1.5 py-0.5 text-xs">yarn licenses:generate</code>로 갱신해요.
          저장소:{" "}
          <Link href="https://github.com/mochiLabs/SiruBOT" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary-control hover:underline">
            mochiLabs/SiruBOT
          </Link>
        </p>
      </div>
    </Container>
  );
}
