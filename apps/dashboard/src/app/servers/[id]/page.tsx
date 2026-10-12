import Image from "next/image";
import { notFound, redirect } from "next/navigation";

import Container from "@/components/container";
import { PageHeader } from "@/components/layout/page-header";
import { ServerDashboard } from "@/components/servers/server-dashboard";
import { auth } from "@/lib/auth";
import { discordGuildIconUrl } from "@/lib/discord-cdn";
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
  const manageableResolved = manageable.status === "ok" && manageable.manageable;

  return (
    <Container>
      <PageHeader
        title={
          <span className="flex items-center gap-3 min-w-0">
            {guildMeta?.icon ? (
              <Image
                src={discordGuildIconUrl(id, guildMeta.icon, 64)}
                alt=""
                width={48}
                height={48}
                className="h-12 w-12 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-2 text-lg font-black text-muted-foreground">
                {(guildMeta?.name ?? "서버").slice(0, 1)}
              </span>
            )}
            <span className="truncate">{guildMeta?.name || "서버 대시보드"}</span>
          </span>
        }
        description="AI 채팅·음악·채널·임시 음성 등 서버 설정을 한 곳에서 관리해요."
      />
      <ServerDashboard guildId={id} manageable={manageableResolved} guildName={guildMeta?.name ?? null} />
    </Container>
  );
}
