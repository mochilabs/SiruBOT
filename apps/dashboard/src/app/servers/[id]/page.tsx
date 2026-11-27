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

  // 탭 전환마다 서버에서 재실행되므로 단일 캐시 호출로 Discord 429 방지
  const [membership, manageable, guildMeta] = await Promise.all([
    resolveGuildMembership(accessToken, session.user.id, id),
    resolveCanManage(accessToken, session.user.id, id),
    resolveGuildMeta(accessToken, session.user.id, id),
  ]);

  if (membership.status === "invalid-token") {
    redirect(`/api/auth/signin?callbackUrl=/servers/${id}`);
  }

  if (membership.status === "unavailable") {
    return (
      <Container>
        <GuildUnavailablePanel />
      </Container>
    );
  }

  if (!membership.isMember) {
    notFound();
  }

  const manageableResolved =
    manageable.status === "ok" && manageable.manageable;

  return (
    <Container>
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
