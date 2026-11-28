"use client";

import Image from "next/image";
import { signOut, useSession } from "next-auth/react";
import { Server } from "lucide-react";

import Container from "@/components/container";
import { ErrorPanel } from "@/components/error-panel";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/primitives/empty-state";
import { GuildCard, SERVERS_GRID_CLASS, SOFT_PRIMARY_LINK_CLASS } from "@/components/servers/guild-card";
import type { EnrichedGuild } from "@/components/servers/guild-card.types";
import { ServersGridSkeleton, ServersPageSkeleton } from "@/components/servers/servers-page-skeleton";
import { buttonVariants } from "@/components/ui/button";
import { useAuthedSWR } from "@/lib/swr";
import { cn } from "@/lib/utils";
import { buildInviteUrl } from "@/utils";

export default function ServersPage() {
    const { data: session, status } = useSession();
    const { data, error, isLoading, mutate } = useAuthedSWR<{ guilds: EnrichedGuild[] }>("/api/servers", "/servers");

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
                <div className="flex w-full sm:w-auto items-center gap-3 bg-surface-1 rounded-card px-4 py-3 shadow-sm relative overflow-hidden">
                    {session?.user?.image ? (
                        <Image src={session.user.image} alt="User avatar" width={40} height={40} className="rounded-full ring-2 ring-primary/20 relative z-10" />
                    ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary-text relative z-10">
                            {session?.user?.name?.charAt(0) || "U"}
                        </div>
                    )}
                    <div className="relative z-10">
                        <p className="text-sm font-extrabold text-foreground">{session?.user?.name}</p>
                        <p className="text-xs font-medium text-muted-foreground">내 계정이 아닌가요? <button type="button" onClick={() => signOut()} className="text-primary-text hover:underline">로그아웃</button></p>
                    </div>
                </div>
            </PageHeader>

            {error ? (
                <ErrorPanel 
                        title="서버 목록 오류" 
                        message="서버 목록을 불러오는데 실패했어요." 
                        onRetry={() => mutate()} 
                    />
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
                                className={cn(buttonVariants(), "h-10 px-4 font-bold", SOFT_PRIMARY_LINK_CLASS)}
                            >
                                시루봇 초대하기
                            </a>
                        }
                    />
                </section>
            ) : (
                <section className="space-y-12">
                    <div className={SERVERS_GRID_CLASS}>
                        {guilds.map((guild) => (
                            <GuildCard key={guild.id} guild={guild} inviteUrl={buildInviteUrl({ guildId: guild.id })} />
                        ))}
                    </div>
                </section>
            )}
        </Container>
    );
}
