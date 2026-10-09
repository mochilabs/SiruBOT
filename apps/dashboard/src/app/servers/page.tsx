"use client";

import { useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { m } from "framer-motion";
import { Server } from "lucide-react";
import useSWR from "swr";

import Container from "@/components/container";
import { ErrorPanel } from "@/components/error-panel";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/primitives/empty-state";
import { GuildCard } from "@/components/servers/guild-card";
import type { EnrichedGuild } from "@/components/servers/guild-card.types";
import { ServersGridSkeleton, ServersPageSkeleton } from "@/components/servers/servers-page-skeleton";
import { buildInviteUrl } from "@/utils";

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
                <ServersPageSkeleton />
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
                title="어떤 서버로 갈까요?"
                description="관리할 서버를 선택하거나, 시루봇을 새로 초대해 주세요."
            >
                <div className="flex items-center gap-3 bg-surface-1 border border-border-subtle rounded-card px-4 py-3 shadow-sm relative overflow-hidden group">
                    <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                    {session?.user?.image ? (
                        <Image src={session.user.image} alt="User avatar" width={40} height={40} className="rounded-full ring-2 ring-primary/20 relative z-10" />
                    ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary-text relative z-10">
                            {session?.user?.name?.charAt(0) || "U"}
                        </div>
                    )}
                    <div className="relative z-10">
                        <p className="text-sm font-black text-foreground">{session?.user?.name}</p>
                        <p className="text-xs font-medium text-muted-foreground">내 계정이 아닌가요? <button onClick={() => signOut()} className="text-primary-text hover:underline cursor-pointer">로그아웃</button></p>
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
                <section className="py-12">
                    <EmptyState
                        icon={Server}
                        title="관리할 수 있는 서버가 아직 없어요."
                        description="시루봇을 서버에 초대하거나, 관리 권한이 있는 서버에서 다시 시도해 주세요."
                        action={
                            <a
                                href={buildInviteUrl({})}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex h-10 items-center gap-2 rounded-control border border-primary/20 bg-primary/10 px-4 text-sm font-bold text-primary-text transition-colors duration-fast hover:bg-primary hover:text-primary-foreground"
                            >
                                시루봇 초대하기
                            </a>
                        }
                        className="border-border-subtle"
                    />
                </section>
            ) : (
                <section className="space-y-12">
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {guilds.map((guild, index) => (
                            <m.div
                                key={guild.id}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: "-50px" }}
                                transition={{ duration: 0.4, delay: Math.min(index, 11) * 0.05 }}
                            >
                                <GuildCard guild={guild} inviteUrl={buildInviteUrl({ guildId: guild.id })} />
                            </m.div>
                        ))}
                    </div>
                </section>
            )}
        </Container>
    );
}
