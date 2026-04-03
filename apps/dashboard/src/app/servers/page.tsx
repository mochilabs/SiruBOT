import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Image from "next/image";
import type { DiscordGuild } from "@/types/discord";
import { ArrowRight, Building2 } from "lucide-react";

async function getUserGuilds(accessToken: string): Promise<DiscordGuild[]> {
  const res = await fetch("https://discord.com/api/v10/users/@me/guilds", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to fetch guilds");
  return res.json();
}

export default async function ServersPage() {
  const session = await auth();
  if (!session) redirect("/api/auth/signin?callbackUrl=/servers");

  const guilds = await getUserGuilds(session.accessToken!);
  const manageableGuilds = guilds.filter((guild) => {
    const permissions = BigInt(guild.permissions);
    return (permissions & BigInt(0x20)) === BigInt(0x20) || (permissions & BigInt(0x8)) === BigInt(0x8);
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="gradient-text">서버 선택</span>
          </h1>
          <p className="text-[var(--color-text-secondary)]">설정할 서버를 선택해주세요</p>
        </div>
        <div className="flex items-center gap-3 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-2">
          {session.user.image && (
            <Image src={session.user.image} alt="" width={28} height={28} className="rounded-full ring-1 ring-[var(--color-border)]" />
          )}
          <p className="text-sm font-medium text-[var(--color-text-primary)]">{session.user.name}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {manageableGuilds.map((guild) => {
          const iconUrl = guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null;
          return (
            <a key={guild.id} href={`/servers/${guild.id}`} className="glass-card group flex flex-col overflow-hidden">
              <div className="flex-1 p-5">
                <div className="flex items-center gap-4">
                  {iconUrl ? (
                    <Image src={iconUrl} alt={`${guild.name} icon`} width={48} height={48} className="shrink-0 rounded-xl ring-1 ring-[var(--color-border)]" />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent2-subtle)] border border-[var(--color-border)] text-lg font-semibold text-[var(--color-text-secondary)]">
                      {guild.name.charAt(0)}
                    </div>
                  )}
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)] line-clamp-2 transition-colors group-hover:text-[var(--color-accent)]">
                    {guild.name}
                  </h3>
                </div>
              </div>
              <div className="border-t border-[var(--color-border)] px-5 py-3">
                <div className="flex items-center justify-between text-xs font-medium text-[var(--color-text-muted)] transition-colors group-hover:text-[var(--color-accent)]">
                  <span>관리하기</span>
                  <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                </div>
              </div>
            </a>
          );
        })}

        {manageableGuilds.length === 0 && (
          <div className="col-span-full glass-panel p-16 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-accent-subtle)] border border-[var(--color-border)] mb-5">
              <Building2 size={28} className="text-[var(--color-text-muted)]" />
            </div>
            <h2 className="text-lg font-medium text-[var(--color-text-primary)] mb-2">관리할 수 있는 서버가 없습니다</h2>
            <p className="text-sm text-[var(--color-text-secondary)]">서버 관리 권한이 있는 서버가 여기에 표시됩니다</p>
          </div>
        )}
      </div>
    </div>
  );
}
