import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import Container from "@/components/container";
import { InteractiveGlow } from "@/components/interactive-glow";
import { GuildCard } from "@/components/servers/guild-card";
import type { EnrichedGuild } from "@/components/servers/guild-card.types";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { DiscordGuild } from "@/types/discord";
import { buildInviteUrl } from "@/utils";

async function getUserGuilds(accessToken: string): Promise<DiscordGuild[]> {
    const res = await fetch("https://discord.com/api/v10/users/@me/guilds", {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
        throw new Error("Failed to fetch guilds");
    }

    return res.json();
}

export default async function ServersPage() {
    const session = await auth();

    if (!session || !session.accessToken) {
        redirect("/api/auth/signin?callbackUrl=/servers");
    }

    // 1. 유저가 속한 모든 길드를 가져옵니다.
    const guilds = await getUserGuilds(session.accessToken);

    // 2. 유저의 모든 길드 ID를 기반으로 DB에 봇이 설치된 서버를 찾습니다.
    const allGuildIds = guilds.map(g => g.id);
    const installedGuilds = await db.guild.findMany({
        where: { id: { in: allGuildIds } },
        select: { id: true }
    });
    const installedSet = new Set(installedGuilds.map(g => g.id));

    // 3. 권한 및 설치 여부를 판별하여 객체를 확장합니다.
    const enrichedGuilds: EnrichedGuild[] = guilds.map((guild) => {
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
    // 정렬
    .sort((a, b) => {
        if (a.isInstalled !== b.isInstalled) return a.isInstalled ? -1 : 1;
        if (a.isManageable !== b.isManageable) return a.isManageable ? -1 : 1;
        return a.name.localeCompare(b.name);
    });

    return (
        <Container>
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
                            {enrichedGuilds.map((guild) => (
                                <GuildCard 
                                    key={guild.id} 
                                    guild={guild} 
                                    inviteUrl={buildInviteUrl({ guildId: guild.id })} 
                                />
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </Container>
    );
}
