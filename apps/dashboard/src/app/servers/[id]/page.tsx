import { notFound, redirect } from "next/navigation";

import Container from "@/components/container";
import { PageHeader } from "@/components/layout/page-header";
import { ServerDashboard } from "@/components/servers/server-dashboard";
import { ServerSwitcher } from "@/components/servers/server-switcher";
import { auth } from "@/lib/auth";
import { resolveCanManage, resolveGuildMeta } from "@/lib/guild-permissions";
import { getSessionAccessToken } from "@/lib/session-token";

interface GuildMember {
  nick: string | null;
  roles: string[];
  joined_at: string;
  user?: {
    id: string;
    username: string;
    avatar: string | null;
  };
}

async function getGuildMember(
  accessToken: string,
  guildId: string,
): Promise<GuildMember | null> {
  const res = await fetch(
    `https://discord.com/api/v10/users/@me/guilds/${guildId}/member`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    },
  );

  console.error(
    `[diag] Discord /users/@me/guilds/${guildId}/member -> ${res.status} ${
      res.ok
        ? ""
        : await res
            .clone()
            .text()
            .then((t) => t.slice(0, 200))
            .catch(() => "")
    }`,
  );

  // 멤버가 아니거나(404) 접근 권한이 없으면(403) 보여줄 대시보드가 없어요.
  if (res.status === 404 || res.status === 403) return null;
  // 토큰 만료(401) — 500 대신 재로그인으로 안내해요.
  if (res.status === 401) {
    redirect(`/api/auth/signin?callbackUrl=/servers/${guildId}`);
  }
  // 429(레이트리밋)/5xx/네트워크 오류 — 일시 장애. 500 폭주 대신 notFound로 우아하게 처리해요
  // (레이트리밋 윈도우가 길어 여기서 재시도해도 소용없고, SWR 계층이 따로 재시도해요).
  if (!res.ok) return null;

  return res.json();
}

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

  const member = await getGuildMember(accessToken, id);

  if (!member) {
    notFound();
  }

  const [manageable, guildMeta] = await Promise.all([
    resolveCanManage(accessToken, session.user.id, id),
    resolveGuildMeta(accessToken, session.user.id, id),
  ]);
  const manageableResolved =
    manageable.status === "ok" && manageable.manageable;

  return (
    <Container>
      <PageHeader
        className="!mb-2 !pb-2"
        title={
          <ServerSwitcher
            guildId={id}
            guildName={guildMeta?.name || "서버 대시보드"}
            icon={guildMeta?.icon ?? null}
          />
        }
      />
      <ServerDashboard
        key={id}
        guildId={id}
        manageable={manageableResolved}
        guildName={guildMeta?.name ?? null}
      />
    </Container>
  );
}
