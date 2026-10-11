import Link from "next/link";

import Container from "@/components/container";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/primitives/badge";
import { Card } from "@/components/primitives/card";

export const metadata = {
  title: "오픈소스 라이선스 | 시루봇",
  description: "시루봇에 포함된 오픈소스 자산과 라이선스 고지예요.",
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

const entries: LicenseEntry[] = [
  {
    name: "Pretendard variable",
    license: "SIL Open Font License 1.1",
    version: "Pretendard Variable v1.3.9",
    source: "https://github.com/orioncactus/pretendard",
    sourceLabel: "orioncactus/pretendard",
    usage: "대시보드 전체 UI 폰트 (한 · 영)",
    note: "일본어 한자는 Pretendard JP Variable(같은 본체의 JP 변형, 동일 라이선스)로 폴백해요.",
  },
  {
    name: "Pretendard JP variable",
    license: "SIL Open Font License 1.1",
    version: "Pretendard JP Variable v1.3.9",
    source: "https://github.com/orioncactus/pretendard",
    sourceLabel: "orioncactus/pretendard",
    usage: "일본어 한자 폴백 폰트 (대시보드 · 카드 렌더 공용)",
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
  {
    name: "Lucide",
    license: "ISC License",
    version: "lucide-react",
    source: "https://lucide.dev",
    sourceLabel: "lucide-icons/lucide",
    usage: "대시보드 아이콘",
  },
];

export default function LicensesPage() {
  return (
    <Container>
      <PageHeader
        title="오픈소스 라이선스"
        description="시루봇과 대시보드에 포함된 오픈소스 자산과 고지예요."
      />
      <div className="space-y-4">
        {entries.map((entry) => (
          <Card key={entry.name} padding="lg" className="gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-black tracking-tight text-foreground">{entry.name}</h2>
              <Badge variant="primary" size="sm">
                {entry.license}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {entry.version} · 사용처: {entry.usage}
            </p>
            {entry.note && (
              <p className="rounded-card border border-border-subtle bg-surface-2 px-4 py-3 text-sm text-muted-foreground">
                {entry.note}
              </p>
            )}
            <a
              href={entry.source}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-sm font-semibold text-primary-text hover:underline"
            >
              {entry.sourceLabel}
            </a>
          </Card>
        ))}
        <p className="px-1 text-xs text-muted-foreground">
          코드 의존성 전체 목록은 저장소의 package.json과 yarn.lock(<Link href="https://github.com/mochiLabs/SiruBOT" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary-text hover:underline">mochiLabs/SiruBOT</Link>)에서 확인할 수 있어요.
        </p>
      </div>
    </Container>
  );
}