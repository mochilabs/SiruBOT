"use client";

import { formatUptime } from "@sirubot/utils/time";
import { Activity, Cpu, HardDrive, Server } from "lucide-react";
import useSWR from "swr";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SkeletonCard } from "@/components/ui/skeleton";
import { formatMemory } from "@/lib/format";
import type { VoiceServerNode } from "@/lib/voice-server-stats";

/** Lavalink CPU 부하는 0~1 비율이라 퍼센트로 바꿔요 */
function cpuPercent(load: number): string {
	return `${(load * 100).toFixed(1)}%`;
}

export function VoiceServerSection() {
	const { data, isLoading } = useSWR<VoiceServerNode[]>("/api/voice-servers", {
		refreshInterval: 15000,
		dedupingInterval: 5000,
	});

	// 섹션 헤더를 계속 마운트해 두고 본문만 상태로 갈아끼워요 (DataApiSection과 같은 처리).
	// 인증 실패·연동 실패 때도 섹션이 통째로 사라지면 화면이 점프해요.
	const sectionHeader = (
		<div className="flex items-center gap-3">
			<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary-text">
				<Server size={19} aria-hidden />
			</div>
			<div>
				<h2 className="text-lg font-bold text-foreground">음성 서버</h2>
				<p className="text-sm text-muted-foreground">Lavalink 노드의 플레이어·리소스 현황</p>
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
						<div className="grid gap-3 sm:grid-cols-3">
							<SkeletonCard lines={2} avatar={false} />
							<SkeletonCard lines={2} avatar={false} />
							<SkeletonCard lines={2} avatar={false} />
						</div>
					) : (
						<p className="text-sm text-muted-foreground">음성 서버 상태를 불러오지 못했어요.</p>
					)}
				</Card>
			</section>
		);
	}

	const totalPlayers = data.reduce((sum, node) => sum + node.players, 0);
	const totalPlaying = data.reduce((sum, node) => sum + node.playingPlayers, 0);
	const memoryUsed = data.reduce((sum, node) => sum + node.memoryUsed, 0);
	const memoryAllocated = data.reduce((sum, node) => sum + node.memoryAllocated, 0);
	const avgLavalinkLoad = data.length === 0 ? 0 : data.reduce((sum, node) => sum + node.cpuLavalinkLoad, 0) / data.length;

	const metrics = [
		{ label: "접속 중인 플레이어", value: totalPlayers.toLocaleString(), detail: `재생 중 ${totalPlaying.toLocaleString()}개`, icon: Activity },
		{ label: "평균 CPU 부하", value: cpuPercent(avgLavalinkLoad), detail: `노드 ${data.length}개 기준`, icon: Cpu },
		{ label: "사용 중인 메모리", value: formatMemory(memoryUsed), detail: `전체 ${formatMemory(memoryAllocated)} 중`, icon: HardDrive },
	];

	return (
		<section className="space-y-4">
			<Card padding="md" className="gap-5">
				<div className="flex flex-wrap items-start justify-between gap-3">
					{sectionHeader}
					<Badge variant={data.length > 0 ? "primary" : "warning"}>{data.length > 0 ? `노드 ${data.length}개` : "노드 없음"}</Badge>
				</div>

				<div className="grid gap-3 sm:grid-cols-3">
					{metrics.map(({ label, value, detail, icon: Icon }) => (
						<div key={label} className="flex min-w-0 items-center gap-3 rounded-control bg-surface-2 p-4">
							<Icon size={17} className="shrink-0 text-muted-foreground" aria-hidden />
							<div className="min-w-0">
								<p className="text-xs text-muted-foreground">{label}</p>
								<p className="truncate text-lg font-bold tabular-nums text-foreground">{value}</p>
								<p className="truncate text-xs text-muted-foreground">{detail}</p>
							</div>
						</div>
					))}
				</div>

				{data.length > 0 && (
					<div className="grid gap-3 sm:grid-cols-2">
						{data.map((node) => (
							<div key={node.host} className="space-y-3 rounded-control bg-surface-2 p-4">
								<div className="flex min-w-0 items-center justify-between gap-2">
									<div className="min-w-0">
										<p className="truncate text-sm font-bold text-foreground">{node.name || node.host}</p>
										<p className="truncate text-xs text-muted-foreground">{node.host}</p>
									</div>
									<Badge variant="primary" size="sm">
										{node.players} 플레이어
									</Badge>
								</div>
								<div className="grid grid-cols-2 gap-2">
									{[
										{ label: "재생 중", value: `${node.playingPlayers}개`, detail: `접속 ${node.players}개 중` },
										{ label: "가동 시간", value: formatUptime(node.uptime / 1000), detail: `코어 ${node.cpuCores}개` },
										{ label: "메모리", value: formatMemory(node.memoryUsed), detail: `할당 ${formatMemory(node.memoryAllocated)}` },
										{ label: "CPU 부하", value: cpuPercent(node.cpuLavalinkLoad), detail: `시스템 ${cpuPercent(node.cpuSystemLoad)}` },
									].map(({ label, value, detail }) => (
										<div key={label} className="min-w-0">
											<p className="text-xs text-muted-foreground">{label}</p>
											<p className="truncate text-sm font-bold tabular-nums text-foreground">{value}</p>
											<p className="truncate text-xs text-muted-foreground">{detail}</p>
										</div>
									))}
								</div>
								<p className="truncate text-2xs text-muted-foreground">수집 {node.timestamp}</p>
							</div>
						))}
					</div>
				)}
			</Card>
		</section>
	);
}
