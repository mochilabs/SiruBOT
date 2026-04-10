import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { DiscordGuild } from "@/types/discord";
import { Settings2, UserPlus, ExternalLink, ShieldCheck, Play } from "lucide-react";
import { InteractiveGlow } from "@/components/interactive-glow";
import { db } from "@/lib/db";

async function getUserGuilds(accessToken: string): Promise<DiscordGuild[]> {
    const res = await fetch("https://discord.com/api/v10/users/@me/guilds", {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
        throw new Error("Failed to fetch guilds");
    }

    return res.json();
}

function buildInviteUrl(guildId: string) {
    const clientId = process.env.AUTH_DISCORD_ID;
    if (!clientId) return null;
    return `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=274877910080&scope=bot%20applications.commands&guild_id=${guildId}&disable_guild_select=true`;
}

export default async function ServersPage() {
    const session = await auth();

    if (!session) {
        redirect("/api/auth/signin?callbackUrl=/servers");
    }

    // 1. 유저가 속한 모든 길드를 가져옵니다.
    const guilds = await getUserGuilds(session.accessToken!);

    // 2. 유저의 모든 길드 ID를 기반으로 DB에 봇이 설치된 서버를 찾습니다.
    const allGuildIds = guilds.map(g => g.id);
    const installedGuilds = await db.guild.findMany({
        where: { id: { in: allGuildIds } },
        select: { id: true }
    });
    const installedSet = new Set(installedGuilds.map(g => g.id));

    // 3. 권한 및 설치 여부를 판별하여 객체를 확장합니다.
    const enrichedGuilds = guilds.map((guild) => {
        const permissions = BigInt(guild.permissions);
        const manageGuild = BigInt(0x20);
        const administrator = BigInt(0x8);
        
        const isManageable = (permissions & manageGuild) === manageGuild || (permissions & administrator) === administrator;
        const isInstalled = installedSet.has(guild.id);

        return {
            ...guild,
            isManageable,
            isInstalled
        };
    })
    // 4. 관리 가능하거나(||) 봇이 이미 설치된 서버만 필터링합니다.
    .filter(guild => guild.isManageable || guild.isInstalled)
    // 정렬: 
    // 1순위: 설치됨 & 관리 가능 (당장 관리해야 함)
    // 2순위: 설치됨 (음악 컨트롤러 사용 가능)
    // 3순위: 미설치 & 관리 가능 (초대 가능)
    .sort((a, b) => {
        if (a.isInstalled !== b.isInstalled) return a.isInstalled ? -1 : 1;
        if (a.isManageable !== b.isManageable) return a.isManageable ? -1 : 1;
        return a.name.localeCompare(b.name);
    });

    return (
        <main className="min-h-screen pt-32 pb-20 relative overflow-hidden">
            <InteractiveGlow />

            <div className="mx-auto w-full max-w-6xl px-6 relative z-10">
                <header className="mb-12 flex flex-col md:flex-row items-start md:items-end justify-between gap-8">
                    <div className="space-y-6">
                        <h1 className="text-4xl md:text-5xl font-black tracking-tighter text-title-gradient leading-[0.9]">
                            서버를 선택해주세요.
                        </h1>
                        <p className="text-xl font-medium text-muted-foreground/80 leading-relaxed max-w-2xl">
                            시루봇 설정과 통계를 확인하고 싶은 <br className="hidden md:block"/> 
                            디스코드 서버를 선택해 주세요.
                        </p>
                    </div>

                    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-md">
                        {session.user.image ? (
                            <Image src={session.user.image} alt="User avatar" width={40} height={40} className="rounded-full ring-2 ring-primary/20" />
                        ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">
                                {session.user.name?.charAt(0) || "U"}
                            </div>
                        )}
                        <div>
                            <p className="text-sm font-black text-foreground">{session.user.name}</p>
                            <p className="text-[11px] font-medium text-muted-foreground/60">이 계정이 아닌가요? <Link href="/api/auth/signout" className="text-primary hover:underline">로그아웃</Link></p>
                        </div>
                    </div>
                </header>

                <section className="space-y-12">
                    {enrichedGuilds.length === 0 ? (
                        <div className="glass-panel p-20 text-center border-dashed border-white/10">
                            <p className="text-xl font-medium text-muted-foreground">접근 가능한 서버가 없습니다.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                            {enrichedGuilds.map((guild) => {
                                const iconUrl = guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null;
                                const inviteUrl = buildInviteUrl(guild.id);

                                return (
                                    <div key={guild.id} className="glass-panel group flex flex-col p-6 transition-all duration-300 hover:border-primary/40 hover:translate-y-[-4px]">
                                        <div className="mb-6 flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                {iconUrl ? (
                                                    <Image src={iconUrl} alt={`${guild.name} icon`} width={56} height={56} className="rounded-full ring-4 ring-primary/10" />
                                                ) : (
                                                    <div className="flex h-[56px] w-[56px] items-center justify-center rounded-full bg-white/5 text-lg font-black text-foreground border border-white/10 group-hover:border-primary/40 transition-colors">
                                                        {guild.name.charAt(0)}
                                                    </div>
                                                )}
                                                <div>
                                                    <h3 className="line-clamp-1 text-lg font-black tracking-tight text-foreground">{guild.name}</h3>
                                                    <div className="flex items-center gap-1 mt-0.5">
                                                        {guild.isInstalled ? (
                                                            <div className="flex items-center gap-1 text-[10px] font-bold text-primary/80 uppercase tracking-widest">
                                                                <ShieldCheck size={10} />
                                                                <span>봇이 설치되어 있어요.</span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-[10px] font-bold text-muted-foreground/30 uppercase tracking-widest">봇이 설치되지 않았어요.</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {guild.isInstalled ? (
                                            guild.isManageable ? (
                                                <div className="flex w-full gap-2">
													<Link
														href={`/servers/${guild.id}`}
														className="mt-auto flex items-center w-full justify-center gap-2 rounded-xl bg-primary/10 border border-primary/20 py-3.5 text-sm font-bold text-primary hover:bg-primary hover:text-white transition-all duration-300 shadow-lg shadow-primary/5"
													>
														<Settings2 size={18} />
														관리하기
													</Link>
													<Link
														href={`/player/${guild.id}`}
														className="mt-auto flex items-center w-full justify-center gap-2 rounded-xl bg-green-500/10 border border-green-500/20 py-3.5 text-sm font-bold text-green-400 hover:bg-green-500 hover:text-white transition-all duration-300 shadow-lg shadow-green-500/5"
													>
														<Play size={18} />
														음악 컨트롤러
													</Link>
												</div>
                                            ) : (
                                                <Link
                                                    href={`/player/${guild.id}`}
                                                    className="mt-auto flex items-center justify-center gap-2 rounded-xl bg-green-500/10 border border-green-500/20 py-3.5 text-sm font-bold text-green-400 hover:bg-green-500 hover:text-white transition-all duration-300 shadow-lg shadow-green-500/5"
                                                >
                                                    <Play size={18} />
                                                    음악 컨트롤러
                                                </Link>
                                            )
                                        ) : (
                                            <a
                                                href={inviteUrl || "#"}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="mt-auto flex items-center justify-center gap-2 rounded-xl bg-white/5 border border-white/10 py-3.5 text-sm font-bold text-foreground hover:bg-white/10 transition-all duration-300"
                                            >
                                                <UserPlus size={18} />
                                                봇 초대하기
                                                <ExternalLink size={14} className="opacity-40" />
                                            </a>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
}