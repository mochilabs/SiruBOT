import { notFound, redirect } from "next/navigation";

import Container from "@/components/container";
import { GuildUnavailablePanel } from "@/components/servers/guild-unavailable-panel";
import { ServerDashboard } from "@/components/servers/server-dashboard";
import { ServerSwitcher } from "@/components/servers/server-switcher";
import { auth } from "@/lib/auth";
import {
  resolveCanManage,
  resolveGuildMembership,
  resolveGuildMeta,
} from "@/lib/guild-permissions";
import { getSessionAccessToken } from "@/lib/session-token";

export default async function ServerDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/api/auth/signin?callbackUrl=/servers/${id}`);
  }

  const accessToken = await getSessionAccessToken();
  if (!accessToken) {
    redirect(`/api/auth/signin?callbackUrl=/servers/${id}`);
  }

  // 멤버십·관리 권한·서버 표시 정보를 하나의 Discord 호출(캐시 + 단일 비행)로 확인해요.
  // 탭을 누를 때마다 페이지가 서버에서 다시 실행되므로, 호출이 캐시되지 않으면
  // Discord 레이트리밋(429)이 곧바로 404처럼 보이는 원인이 돼요.
  const [membership, manageable, guildMeta] = await Promise.all([
    resolveGuildMembership(accessToken, session.user.id, id),
    resolveCanManage(accessToken, session.user.id, id),
    resolveGuildMeta(accessToken, session.user.id, id),
  ]);

  if (membership.status === "invalid-token") {
    // 토큰 만료(401): 재로그인으로 안내해요.
    redirect(`/api/auth/signin?callbackUrl=/servers/${id}`);
  }

  // Discord 일시 장애(429/5xx/네트워크): 없는 페이지가 아니에요. 404로 위장하지 않아요.
  if (membership.status === "unavailable") {
    return (
      <Container>
        <GuildUnavailablePanel />
      </Container>
    );
  }

  // 멤버가 아니면(또는 접근 권한이 없으면) 보여줄 대시보드가 없어요.
  if (!membership.isMember) {
    notFound();
  }

  const manageableResolved =
    manageable.status === "ok" && manageable.manageable;

  return (
    <Container>
      {/* 서버 선택기: PC(lg+)는 사이드바 맨 위, 모바일은 기능 선택 버튼 오른쪽 같은 줄 */}
      <h1 className="sr-only">{guildMeta?.name || "서버 대시보드"}</h1>
      <ServerDashboard
        switcher={<ServerSwitcher variant="sidebar" guildId={id} guildName={guildMeta?.name || "서버 대시보드"} icon={guildMeta?.icon ?? null} />}
        mobileSwitcher={<ServerSwitcher variant="compact" guildId={id} guildName={guildMeta?.name || "서버 대시보드"} icon={guildMeta?.icon ?? null} />}
        key={id}
        guildId={id}
        manageable={manageableResolved}
        guildName={guildMeta?.name ?? null}
      />
    </Container>
  );
}
