import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import Container from "@/components/container";
import { GuildCard } from "@/components/servers/guild-card";
import type { EnrichedGuild } from "@/components/servers/guild-card.types";
import { ServersGridSkeleton } from "@/components/servers/servers-page-skeleton";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { DiscordGuild } from "@/types/discord";
import { buildInviteUrl } from "@/utils";

async function getUserGuilds(accessToken: string): Promise<DiscordGuild[]> {
    const res = await fetch("https://discord.com/api/v10/users/@me/guilds", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
    });

    if (!res.ok) {
        throw new Error("Failed to fetch guilds");
    }

    return res.json();
}

async function getEnrichedGuilds(accessToken: string): Promise<EnrichedGuild[]> {
    const guilds = await getUserGuilds(accessToken);
    const allGuildIds = guilds.map((guild) => guild.id);

    const installedGuilds = await db.guild.findMany({
        where: { id: { in: allGuildIds } },
        select: { id: true },
    });
    const installedSet = new Set(installedGuilds.map((guild) => guild.id));

    return guilds
        .map((guild) => {
            const permissions = BigInt(guild.permissions);
            const manageGuild = BigInt(0x20);
            const administrator = BigInt(0x8);

            const isManageable =
                (permissions & manageGuild) === manageGuild ||
                (permissions & administrator) === administrator;
            const isInstalled = installedSet.has(guild.id);

            return {
                ...guild,
                isManageable,
                isInstalled,
            };
        })
        .filter((guild) => guild.isManageable || guild.isInstalled)
        .sort((a, b) => {
            if (a.isInstalled !== b.isInstalled) return a.isInstalled ? -1 : 1;
            if (a.isManageable !== b.isManageable) return a.isManageable ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
}

async function ServersGrid({ accessToken }: { accessToken: string }) {
    const enrichedGuilds = await getEnrichedGuilds(accessToken);

    if (enrichedGuilds.length === 0) {
        return (
            <section className="space-y-12">
                <div className="glass-panel border-dashed border-border/50 p-20 text-center shadow-xl">
                    <p className="text-xl font-medium text-muted-foreground">No manageable servers were found.</p>
                </div>
            </section>
        );
    }

    return (
        <section className="space-y-12">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {enrichedGuilds.map((guild) => (
                    <GuildCard
                        key={guild.id}
                        guild={guild}
                        inviteUrl={buildInviteUrl({ guildId: guild.id })}
                    />
                ))}
            </div>
        </section>
    );
}

export default async function ServersPage() {
    const session = await auth();

    if (!session || !session.accessToken) {
        redirect("/api/auth/signin?callbackUrl=/servers");
    }

    return (
        <Container>
            <header className="mb-10 flex flex-col lg:flex-row items-start lg:items-end justify-between gap-8 pb-8 border-b border-border/40 relative">
                    <div className="space-y-6 flex-1">
                        <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-primary/5 dark:bg-primary/10 border border-primary/20 text-primary text-sm font-bold shadow-sm shadow-primary/5">
                            <span className="relative flex h-2 w-2">
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                            </span>
                            <span className="tracking-tight">서버 선택</span>
                        </div>
                        
                        <div className="space-y-2">
                            <h1 className="text-5xl md:text-6xl font-black tracking-tighter text-title-gradient leading-[0.9] py-1">
                                어떤 서버로 갈까요?
                            </h1>
                            <p className="text-xl font-medium text-muted-foreground/80 leading-relaxed max-w-2xl">
                                시루봇의 설정과 통계를 볼 서버를 선택해주세요.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 glass-panel px-4 py-3 shadow-2xl relative overflow-hidden group">
                        <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        {session.user.image ? (
                            <Image src={session.user.image} alt="User avatar" width={40} height={40} className="rounded-full ring-2 ring-primary/20" />
                        ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">
                                {session.user.name?.charAt(0) || "U"}
                            </div>
                        )}
                        <div>
                            <p className="text-sm font-black text-foreground">{session.user.name}</p>
                            <p className="text-[11px] font-medium text-muted-foreground/60">내 계정이 아닌가요? <Link href="/api/auth/signout" className="text-primary hover:underline">로그아웃</Link></p>
                        </div>
                    </div>
                </header>

            <Suspense fallback={<ServersGridSkeleton />}>
                <ServersGrid accessToken={session.accessToken} />
            </Suspense>
        </Container>
    );
}
