import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Image from "next/image";
import type { DiscordGuild } from "@/types/discord";
import { ArrowRight, Building2, ShieldCheck } from "lucide-react";

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
    return (
      (permissions & BigInt(0x20)) === BigInt(0x20) ||
      (permissions & BigInt(0x8)) === BigInt(0x8)
    );
  });

  return (
    <div className="space-y-10 pb-20 animate-fade-in-up">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between border-b border-white/10 pb-8">
        <div className="space-y-2">
          <h1 className="text-4xl font-extrabold tracking-tight text-white">
            서버 관리
          </h1>
          <p className="text-lg text-gray-400">
            설정할 디스코드 서버를 선택해주세요
          </p>
        </div>
        <div className="flex items-center gap-4 bg-[#121214] border border-white/10 rounded-xl px-4 py-3 shadow-sm">
          {session.user.image && (
            <Image
              src={session.user.image}
              alt=""
              width={32}
              height={32}
              className="rounded-lg"
            />
          )}
          <div className="flex flex-col">
            <p className="text-sm font-semibold text-white">
              {session.user.name}
            </p>
            <p className="text-xs text-gray-500">관리자 계정</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {manageableGuilds.map((guild, i) => {
          const iconUrl = guild.icon
            ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`
            : null;
          return (
            <a
              key={guild.id}
              href={`/servers/${guild.id}`}
              className={`group flex flex-col rounded-2xl bg-[#121214] border border-white/10 hover:border-[var(--color-accent)]/50 hover:bg-[#18181b] transition-all duration-300 shadow-sm hover:shadow-[0_8px_30px_rgba(0,0,0,0.5)] overflow-hidden animate-fade-in-up stagger-${(i % 4) + 1}`}
            >
              <div className="p-6 flex-1">
                <div className="flex items-start justify-between mb-4">
                  {iconUrl ? (
                    <Image
                      src={iconUrl}
                      alt={`${guild.name} icon`}
                      width={56}
                      height={56}
                      className="shrink-0 rounded-xl bg-[#1c1c1f]"
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#1c1c1f] to-[#121214] border border-white/5 text-xl font-bold text-gray-400">
                      {guild.name.charAt(0)}
                    </div>
                  )}
                  <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-400">
                    <ShieldCheck size={16} />
                  </div>
                </div>
                <h3 className="text-base font-semibold text-white line-clamp-2 mb-1 group-hover:text-[var(--color-accent)] transition-colors">
                  {guild.name}
                </h3>
                <p className="text-xs text-gray-500">ID: {guild.id}</p>
              </div>

              <div className="px-6 py-4 bg-white/[0.02] border-t border-white/5 flex items-center justify-between group-hover:bg-[var(--color-accent)]/5 transition-colors">
                <span className="text-sm font-medium text-gray-400 group-hover:text-[var(--color-accent)] transition-colors">
                  대시보드 열기
                </span>
                <ArrowRight
                  size={16}
                  className="text-gray-500 group-hover:text-[var(--color-accent)] group-hover:translate-x-1 transition-all"
                />
              </div>
            </a>
          );
        })}

        {manageableGuilds.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center rounded-3xl bg-[#121214] border border-white/10 p-20 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/5 border border-white/10 mb-6">
              <Building2 size={32} className="text-gray-500" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">
              관리할 수 있는 서버가 없습니다
            </h2>
            <p className="text-gray-400 max-w-md mx-auto">
              서버 관리 권한이 있는 디스코드 서버만 대시보드에 표시됩니다.
              서버에 관리자로 참여 중인지 확인해주세요.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
