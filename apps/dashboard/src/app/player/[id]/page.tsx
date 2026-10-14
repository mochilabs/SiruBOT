import { redirect } from "next/navigation";

import Container from "@/components/container";
import { PageHeader } from "@/components/layout/page-header";
import WebPlayerSection from "@/components/player/web-player-section";
import { auth } from "@/lib/auth";
import { resolveGuildMembership } from "@/lib/guild-permissions";
import { getSessionAccessToken } from "@/lib/session-token";

export const metadata = {
  title: "음악 플레이어 | 시루봇",
  description: "실시간 재생 상태를 확인하고 곡을 검색해 바로 재생해요.",
};

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/api/auth/signin?callbackUrl=/player/${id}`);
  }

  // 제어 권한(DJ)은 봇이 요청자 멤버로 판정하므로 페이지는 길드 멤버면 진입해요.
  const accessToken = await getSessionAccessToken();
  const membership = accessToken
    ? await resolveGuildMembership(accessToken, session.user.id, id)
    : { status: "unavailable" as const };

  if (membership.status === "invalid-token") {
    redirect(`/api/auth/signin?callbackUrl=/player/${id}`);
  }

  if (membership.status !== "ok" || !membership.isMember) {
    return (
      <Container>
        <PageHeader
          title="음악 플레이어"
          description="이 페이지는 서버 멤버만 사용할 수 있어요."
        />
        <p className="rounded-card border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning">
          {membership.status === "unavailable"
            ? "Discord 상태가 좋지 않아 멤버십을 확인하지 못했어요. 잠시 후 다시 시도해 주세요."
            : "이 서버의 멤버만 실시간 플레이어를 사용할 수 있어요. 서버에 접속한 뒤 다시 시도해 주세요."}
        </p>
      </Container>
    );
  }

  return (
    <Container>
      <PageHeader
        title="음악 플레이어"
        description="지금 플레이 중인 곡을 실시간으로 보고, 검색해서 바로 재생해요. 음성 채널에 접속 중이라면 봇이 채널에 접속해 재생해요."
      />
      <WebPlayerSection key={id} guildId={id} />
    </Container>
  );
}
