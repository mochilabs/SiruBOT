import type { Metadata } from "next";
import Link from "next/link";

import Container from "@/components/container";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "이용약관",
  description: "시루봇 서비스 이용약관이에요.",
};

const sections = [
  {
    title: "서비스 소개",
    description:
      "시루봇(이하 '시루봇')은 Discord 플랫폼 위에서 음악 재생, AI 채팅, 서버 관리 편의 기능을 제공하는 비영리 커뮤니티 프로젝트예요.",
  },
  {
    title: "이용자의 의무",
    description:
      "시루봇을 이용할 때는 Discord의 약관과 관련 법령을 따라야 해요. 시루봇을 악용하거나 다른 이용자에게 피해를 주는 행위, 서비스 운영을 방해하는 행위는 제한될 수 있어요.",
  },
  {
    title: "서비스의 변경 및 중단",
    description:
      "시루봇은 상시 업데이트되며, 기능 추가·변경·중단이 있을 수 있어요. 장애 점검이나 불가피한 사유로 서비스가 일시 중단될 수 있고, 이 경우 공식 디스코드 서버나 GitHub 공지사항을 통해 안내해요.",
  },
  {
    title: "책임의 한계",
    description:
      "시루봇은 무료로 제공되는 커뮤니티 프로젝트로, 서비스의 무중단·오류 없음을 보장하지 않아요. 시루봇 이용으로 발생한 직·간접적 손해에 대해서는 책임을 지지 않아요. 음악 재생 기능은 외부 공급자 API에 의존하며, 외부 사정으로 서비스가 제한될 수 있어요.",
  },
  {
    title: "개인정보",
    description:
      "시루봇이 처리하는 개인정보의 범위와 이용 방법은 개인정보처리방침에서 자세히 안내해요.",
    link: { label: "개인정보처리방침 보기", href: "/privacy" },
  },
  {
    title: "준거법 및 문의",
    description:
      "본 약관은 대한민국 법률을 준거법으로 해요. 서비스에 대한 문의나 의견은 공식 디스코드 서버 또는 GitHub 이슈로 남겨주세요.",
  },
];

export default function TermsPage() {
  return (
    <Container>
      <PageHeader title="이용약관" description="시루봇 서비스 이용약관이에요. 아래 내용을 확인해 주세요." />
      <div className="space-y-6">
        {sections.map((section) => (
          <Card key={section.title} padding="lg">
            <h2 className="text-lg font-bold text-foreground">{section.title}</h2>
            <p className="mt-2 text-sm font-medium leading-relaxed text-muted-foreground">
              {section.description}
            </p>
            {"link" in section && section.link ? (
              <Link href={section.link.href} className="mt-3 inline-block text-sm font-semibold text-primary-text hover:underline">
                {section.link.label}
              </Link>
            ) : null}
          </Card>
        ))}
        <p className="text-xs font-medium text-muted-foreground">최종 업데이트: 2026년 10월 25일</p>
      </div>
    </Container>
  );
}
