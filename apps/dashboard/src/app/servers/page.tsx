"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import useSWR from "swr";

import Container from "@/components/container";
import Loader from "@/components/loader";
import { GuildCard } from "@/components/servers/guild-card";
import type { EnrichedGuild } from "@/components/servers/guild-card.types";
import { ServersGridSkeleton } from "@/components/servers/servers-page-skeleton";
import { buildInviteUrl } from "@/utils";

export default function ServersPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const { data, error, isLoading } = useSWR<{ guilds: EnrichedGuild[] }>(
        status === "authenticated" ? "/api/servers" : null,
    );

    if (status === "loading") {
        return (
            <Container>
                <Loader fullPage />
            </Container>
        );
    }

    if (status === "unauthenticated") {
        router.push("/api/auth/signin?callbackUrl=/servers");
        return null;
    }

    const guilds = data?.guilds ?? [];

    return (
        <Container>
            <header className="mb-8 flex flex-col lg:flex-row items-start lg:items-end justify-between gap-8 pb-6 sm:pb-8 border-b border-border/40 relative">
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
                            어느 서버를 관리할까요?
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 glass-panel px-4 py-3 shadow-2xl relative overflow-hidden group">
                    <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                    {session?.user?.image ? (
                        <Image src={session.user.image} alt="User avatar" width={40} height={40} className="rounded-full ring-2 ring-primary/20 relative z-10" />
                    ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary relative z-10">
                            {session?.user?.name?.charAt(0) || "U"}
                        </div>
                    )}
                    <div className="relative z-10">
                        <p className="text-sm font-black text-foreground">{session?.user?.name}</p>
                        <p className="text-[11px] font-medium text-muted-foreground/60">내 계정이 아닌가요? <button onClick={() => signOut()} className="text-primary hover:underline cursor-pointer">로그아웃</button></p>
                    </div>
                </div>
            </header>

            {error ? (
                <div className="glass-panel p-20 text-center border-red-500/20 shadow-xl">
                    <p className="text-xl font-medium text-red-400">서버 목록을 불러오는데 실패했어요.</p>
                </div>
            ) : isLoading ? (
                <ServersGridSkeleton />
            ) : guilds.length === 0 ? (
                <section className="space-y-12">
                    <div className="glass-panel border-dashed border-border/50 p-20 text-center shadow-xl">
                        <p className="text-xl font-medium text-muted-foreground">관리할 수 있는 서버가 아직 없어요.</p>
                    </div>
                </section>
            ) : (
                <section className="space-y-12">
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {guilds.map((guild) => (
                            <GuildCard
                                key={guild.id}
                                guild={guild}
                                inviteUrl={buildInviteUrl({ guildId: guild.id })}
                            />
                        ))}
                    </div>
                </section>
            )}
        </Container>
    );
}
