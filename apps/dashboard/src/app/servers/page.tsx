"use client";

import { useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import useSWR from "swr";

import Container from "@/components/container";
import { ErrorPanel } from "@/components/error-panel";
import Loader from "@/components/loader";
import { GuildCard } from "@/components/servers/guild-card";
import type { EnrichedGuild } from "@/components/servers/guild-card.types";
import { ServersGridSkeleton } from "@/components/servers/servers-page-skeleton";
import { buildInviteUrl } from "@/utils";
import { PageHeader } from "@/components/layout/page-header";

export default function ServersPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const { data, error, isLoading, mutate } = useSWR<{ guilds: EnrichedGuild[] }>(
        status === "authenticated" ? "/api/servers" : null,
    );

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/api/auth/signin?callbackUrl=/servers");
        }
    }, [status, router]);

    if (status === "loading") {
        return (
            <Container>
                <Loader fullPage />
            </Container>
        );
    }

    if (status === "unauthenticated") {
        return null;
    }

    const guilds = data?.guilds ?? [];

    return (
        <Container>
            <PageHeader
                badge="서버 선택"
                badgeIcon={
                    <span className="relative flex h-2 w-2">
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                    </span>
                }
                title="어떤 서버로 갈까요?"
                description="어느 서버를 관리할까요?"
            >
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
                        <p className="text-xs font-medium text-muted-foreground/60">내 계정이 아닌가요? <button onClick={() => signOut()} className="text-primary hover:underline cursor-pointer">로그아웃</button></p>
                    </div>
                </div>
            </PageHeader>

            {error ? (
                <div className="py-12">
                    <ErrorPanel 
                        title="서버 목록 오류" 
                        message="서버 목록을 불러오는데 실패했어요." 
                        onRetry={() => mutate()} 
                    />
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
