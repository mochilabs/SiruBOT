import { notFound, redirect } from "next/navigation";

import Container from "@/components/container";
import { PageHeader } from "@/components/layout/page-header";
import { AiSettings } from "@/components/servers/ai-settings";
import { auth } from "@/lib/auth";

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
    },
  );

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Discord API error: ${res.status}`);

  return res.json();
}

export default async function ServerDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  if (!session?.accessToken) {
    redirect(`/api/auth/signin?callbackUrl=/servers/${id}`);
  }

  const member = await getGuildMember(session.accessToken, id);

  if (!member) {
    notFound();
  }

  return (
    <Container>
      <PageHeader
        title="서버 대시보드"
        description="서버의 AI 채팅 설정과 기록을 관리해요."
      />
      <AiSettings guildId={id} />
    </Container>
  );
}
