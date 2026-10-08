import { notFound, redirect } from "next/navigation";

import Container from "@/components/container";
import { PageHeader } from "@/components/layout/page-header";
import { OhaasaWidget } from "@/components/servers/ohaasa-widget";
import { ServerDashboard } from "@/components/servers/server-dashboard";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManage } from "@/lib/guild-permissions";
import { getSessionAccessToken } from "@/lib/session-token";
import { getZodiac } from "@/lib/zodiac";

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

  const manageable = await canManage(accessToken, id);

  // 세션 유저 생일 → 별자리 코드 (운세 위젯 하이라이트용). 생일 없으면 null.
  const profile = await db.user.findUnique({
    where: { id: session.user.id },
    select: { birthMonth: true, birthDay: true },
  });
  const zodiacCode =
    profile?.birthMonth != null && profile?.birthDay != null
      ? getZodiac(profile.birthMonth, profile.birthDay)?.code ?? null
      : null;

  return (
    <Container>
      <PageHeader
        title="서버 대시보드"
        description="AI 채팅·음악·채널·임시 음성 등 서버 설정을 한 곳에서 관리해요."
      />
      <div className="mb-6">
        {/* 운세는 서버별 데이터가 아닌 전체 공용 데이터라 페이지 상단에 배치해요. */}
        <OhaasaWidget zodiacCode={zodiacCode} />
      </div>
      <ServerDashboard guildId={id} manageable={manageable} />
    </Container>
  );
}
