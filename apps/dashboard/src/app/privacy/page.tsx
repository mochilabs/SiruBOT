import type { Metadata } from "next";
import Link from "next/link";

import Container from "@/components/container";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description: "시루봇이 어떻게 개인정보를 수집·이용·보관하는지 안내해요.",
};

const sections = [
  {
    title: "수집하는 개인정보",
    description:
      "시루봇은 서비스 제공을 위해 최소한의 정보만 수집해요. Discord 로그인 시 식별자(id), 프로필 사진, 사용자명, 서버 목록 등 Discord가 제공하는 기본 정보만 받으며 이메일은 수집하지 않아요. 음악 재생·플레이리스트·AI 채팅·프로필·게임·대시보드 이용 과정에서 재생 기록, 플레이리스트, AI 기억(장기·단기·요약), 생일·소개, TTS 설정, 게임 전적, 기브어웨이 참여 기록(참여한 기브어웨이와 사용자 ID), 서버 설정 정보가 생성될 수 있어요. 또한 기능별 사용 횟수는 서버나 사용자 식별자 없이 전체 합계만 익명으로 집계해요.",
  },
  {
    title: "개인정보 이용 목적",
    description:
      "수집한 정보는 서비스 제공·개인화(플레이리스트, 프로필 통계), 문의 응대, 서비스 개선 및 오류 분석 목적으로만 사용해요. 시루봇은 광고 목적으로 개인정보를 사용하지 않아요.",
  },
  {
    title: "개인정보 보관 및 파기",
    description:
      "시루봇은 서비스 제공에 필요한 최소 기간 동안만 개인정보를 보관해요. 계정 탈퇴 또는 서비스 이용 종료 시 관련 개인정보는 지체 없이 파기돼요. 단, 관련 법령에 따라 보존이 필요한 경우 해당 기간 동안 별도 분리 보관될 수 있어요.",
  },
  {
    title: "서드파티 서비스",
    description:
      "시루봇은 Discord API, Lavalink(음악 스트리밍), 외부 차트·날씨·택배 정보 API 등 외부 서비스와 연동될 수 있어요. 외부 서비스가 개인정보를 직접 수집하는 경우 해당 서비스의 개인정보처리방침이 적용돼요.",
  },
  {
    title: "이용자의 권리",
    description:
      "이용자는 언제든 자신의 개인정보 열람·수정·삭제를 요청할 수 있어요. 디스코드에서 `/개인정보 보기`와 `/개인정보 삭제` 명령으로 AI 기억(장기·단기·요약), 프로필 생일·소개, TTS 설정, 게임 전적, 기브어웨이 참여 기록을 직접 확인하고 지울 수 있어요. 그 밖의 요청은 공식 디스코드 서버 또는 GitHub 이슈를 통해 남겨 주시면 확인 후 처리할게요.",
  },
  {
    title: "문의처",
    description:
      "개인정보와 관련된 문의는 공식 디스코드 서버 또는 GitHub 이슈 트래커를 통해 남겨주세요.",
  },
];

export default function PrivacyPage() {
  return (
    <Container>
      <PageHeader title="개인정보처리방침" description="시루봇이 어떻게 개인정보를 수집·이용·보관하는지 안내해요." />
      <div className="space-y-6">
        {sections.map((section) => (
          <Card key={section.title} padding="lg">
            <h2 className="text-lg font-bold text-foreground">{section.title}</h2>
            <p className="mt-2 text-sm font-medium leading-relaxed text-muted-foreground">
              {section.description}
            </p>
          </Card>
        ))}
        <p className="text-xs font-medium text-muted-foreground">
          본 방침은 서비스 특성에 따라 업데이트될 수 있으며, 중요한 변경 시 공식 디스코드 서버나 GitHub 공지사항을 통해 안내해요.{" "}
          <Link href="/terms" className="font-semibold text-primary-text hover:underline">
            이용약관
          </Link>
          을 함께 확인해 주세요.
        </p>
        <p className="text-xs font-medium text-muted-foreground">최종 업데이트: 2026년 11월 21일</p>
      </div>
    </Container>
  );
}
