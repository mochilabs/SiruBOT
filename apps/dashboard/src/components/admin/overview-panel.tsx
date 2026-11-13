"use client";

import Link from "next/link";
import { Bell, Brain, Database, ExternalLink, ListMusic, Music, RefreshCw, Server, SlidersHorizontal, Ticket, UserRound } from "lucide-react";
import useSWR from "swr";

import { StatCard } from "@/components/data/stat-card";
import { DataApiSection } from "@/components/data-api-section";
import { ProcessCard } from "@/components/process-card";
import { PanelHeader, RetryLink, WarningBox } from "@/components/servers/settings-shared";
import { ShardStats } from "@/components/shard-stats";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SkeletonCard } from "@/components/ui/skeleton";
import { VoiceServerSection } from "@/components/voice-server-section";
import type { DataApiStatus } from "@/lib/data-api/types";
import type { ShardsResponse } from "@/lib/shard-api";
import { createApiFetcher } from "@/lib/swr";
import { cn } from "@/lib/utils";

interface OverviewData {
	counts: {
		guilds: number;
		users: number;
		tracks: number;
		playlists: number;
		customCommands: number;
		openTickets: number;
		totalTickets: number;
		activeSocialSubs: number;
		failedSocialSubs: number;
		disabledSocialSubs: number;
		userMemories: number;
	};
	shards: ShardsResponse | null;
	dataApi: DataApiStatus | null;
}

const overviewFetcher = createApiFetcher<OverviewData>("현황 데이터를 불러오지 못했어요.");

export function OverviewPanel() {
	const { data, error, isLoading, mutate } = useSWR<OverviewData>("/api/admin/overview", overviewFetcher, {
		refreshInterval: 15_000,
	});

	if (isLoading && !data) {
		return (
			<div className="space-y-6">
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<SkeletonCard className="h-28" />
					<SkeletonCard className="h-28" />
					<SkeletonCard className="h-28" />
					<SkeletonCard className="h-28" />
				</div>
				<SkeletonCard className="h-64" />
			</div>
		);
	}

	if (error && !data) {
		return (
			<WarningBox>
				운영자 현황을 불러오지 못했어요. ({error.message}) <RetryLink onRetry={() => void mutate()} />
			</WarningBox>
		);
	}

	if (!data) return null;

	const { counts, shards } = data;

	return (
		<div className="space-y-8">
			<Card padding="md" className="space-y-6">
				<PanelHeader
					icon={<Database size={20} />}
					title="데이터베이스 집계 현황"
					description="등록된 길드·유저·트랙·명령어·티켓·소셜 알림 구독 현황이에요."
					action={
						<Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={() => void mutate()}>
							새로고침
						</Button>
					}
				/>

				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<StatCard
						icon={Server}
						label="DB 등록 서버"
						value={counts.guilds}
						sub={shards ? `실시간 샤드 길드 ${shards.stats.totalGuilds.toLocaleString("ko-KR")}개` : undefined}
					/>
					<StatCard
						icon={UserRound}
						label="등록 유저"
						value={counts.users}
						sub={`AI 기억 보유 ${counts.userMemories.toLocaleString("ko-KR")}명`}
					/>
					<StatCard
						icon={Music}
						label="누적 트랙"
						value={counts.tracks}
						sub={`플레이리스트 ${counts.playlists.toLocaleString("ko-KR")}개`}
					/>
					<StatCard
						icon={SlidersHorizontal}
						label="커스텀 명령어"
						value={counts.customCommands}
						sub="길드 접두사·슬래시 명령어 합계"
					/>
					<StatCard
						icon={Ticket}
						label="열린 티켓"
						value={counts.openTickets}
						sub={`전체 누적 ${counts.totalTickets.toLocaleString("ko-KR")}건`}
					/>
					<StatCard
						icon={Bell}
						label="소셜 알림 구독 (정상)"
						value={counts.activeSocialSubs}
						sub={`실패 ${counts.failedSocialSubs}건 · 일시정지 ${counts.disabledSocialSubs}건`}
					/>
					<StatCard
						icon={ListMusic}
						label="활성 플레이어"
						value={shards?.stats.totalPlayers ?? 0}
						sub={shards ? `샤드 ${shards.stats.allocatedShards}/${shards.stats.shardCount} 가동` : "샤드 매니저 미연결"}
					/>
					<StatCard
						icon={Brain}
						label="봇 총 메모리"
						value={`${shards?.stats.totalMemoryMB ?? 0} MB`}
						sub={shards ? `프로세스 ${shards.stats.processCount}개 연결됨` : undefined}
					/>
				</div>
			</Card>

			{shards && (
				<section className="space-y-4">
					<div className="flex items-center justify-between">
						<h3 className="text-base font-bold text-foreground">샤드 클러스터 요약</h3>
						<Link href="/shards" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5")}>
							<span>시스템 상태 전체 보기</span>
							<ExternalLink size={14} />
						</Link>
					</div>
					<ShardStats stats={shards.stats} />
					{shards.processes.length > 0 && (
						<div className="grid gap-4 md:grid-cols-2">
							{shards.processes.map((proc, index) => (
								<ProcessCard key={proc.wsId} process={proc} index={index} />
							))}
						</div>
					)}
				</section>
			)}

			<DataApiSection />
			<VoiceServerSection />
		</div>
	);
}
