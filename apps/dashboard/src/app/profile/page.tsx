import { redirect } from "next/navigation";

import Container from "@/components/container";
import { auth } from "@/lib/auth";
import { getProfileStats } from "@/lib/profile-stats";

import { ProfileView } from "./profile-view";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/api/auth/signin?callbackUrl=/profile");
  }

  const stats = await getProfileStats(session.user.id);

  return (
    <Container>
      <ProfileView
        user={{
          id: session.user.id,
          name: session.user.name ?? session.user.id,
          image: session.user.image ?? null,
        }}
        birthday={stats.birthday}
        music={stats.music}
        games={stats.games}
        attendance={stats.attendance}
      />
    </Container>
  );
}
