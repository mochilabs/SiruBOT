"use client";

import { Activity, Server } from "lucide-react";
import useSWR from "swr";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SkeletonCard } from "@/components/ui/skeleton";
import type { PublicVoiceServerSummary } from "@/lib/voice-server-stats";

export function VoiceServerSection() {
	const { data, isLoading } = useSWR<PublicVoiceServerSummary>("/api/voice-servers", {
		refreshInterval: 15000,
		dedupingInterval: 5000,
	});

	// 섹션 헤더를 계속 마운트해 두고 본문만 상태로 갈아끼워요.
	// 연동 실패 때도 섹션이 통째로 사라지면 화면이 점프해요.
	const sectionHeader = (
		<div className="flex items-center gap-3">
			<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary-text">
				<Server size={19} aria-hidden />
			</div>
			<div>
				<h2 className="text-lg font-bold text-foreground">음성 서버</h2>
				<p className="text-sm text-muted-foreground">Lavalink 노드의 스트리밍 현황</p>
			</div>
		</div>
	);

	if (!data) {
		return (
			<section className="space-y-4">
				<Card padding="md" className="gap-5">
					<div className="flex flex-wrap items-start justify-between gap-3">
						{sectionHeader}
					</div>
					{isLoading ? (
						<div className="grid gap-3 sm:grid-cols-1">
							<SkeletonCard lines={2} avatar={false} />
						</div>
					) : (
						<p className="text-sm text-muted-foreground">음성 서버 상태를 불러오지 못했어요.</p>
					)}
				</Card>
			</section>
		);
	}

	return (
		<section className="space-y-4">
			<Card padding="md" className="gap-5">
				<div className="flex flex-wrap items-start justify-between gap-3">
					{sectionHeader}
					<Badge variant={data.nodeCount > 0 ? "primary" : "warning"}>
						{data.nodeCount > 0 ? `노드 ${data.nodeCount}개` : "노드 없음"}
					</Badge>
				</div>

				<div className="grid gap-3 sm:grid-cols-1">
					<div className="flex min-w-0 items-center gap-3 rounded-control bg-surface-2 p-4">
						<Activity size={17} className="shrink-0 text-muted-foreground" aria-hidden />
						<div className="min-w-0">
							<p className="text-xs text-muted-foreground">접속 중인 플레이어</p>
							<p className="truncate text-lg font-bold tabular-nums text-foreground">{data.totalPlayers.toLocaleString()}</p>
							<p className="truncate text-xs text-muted-foreground">재생 중 {data.totalPlaying.toLocaleString()}개</p>
						</div>
					</div>
				</div>
			</Card>
		</section>
	);
}
