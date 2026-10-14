"use client";

import { Clock3, HardDrive, RadioTower, Server } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatMemory, formatRelativeTime, formatUptime } from "@/lib/format";
import type { ShardProcessInfo } from "@/lib/shard-api";

function ProcessStatusBadge({ status }: { status: string }) {
	const normalized = status.toLowerCase();
	const config: Record<string, { variant: "success" | "warning" | "info" | "destructive" | "default"; label: string }> = {
		ready: { variant: "success", label: "정상" },
		idle: { variant: "warning", label: "대기" },
		connecting: { variant: "info", label: "연결 중" },
		disconnected: { variant: "destructive", label: "연결 끊김" },
		errored: { variant: "destructive", label: "오류" },
	};
	const { variant, label } = config[normalized] ?? { variant: "default", label: status };
	return <Badge variant={variant}>{label}</Badge>;
}

export function ProcessCard({ process, index }: { process: ShardProcessInfo; index: number }) {
	return (
		<Card padding="lg" className="gap-6 transition-all duration-base">
			<div className="flex items-center justify-between gap-4">
				<div className="flex items-center gap-3">
					<div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary-text">
						<Server size={20} />
					</div>
					<div>
						<h3 className="text-lg font-black tracking-tighter text-foreground">프로세스 #{index + 1}</h3>
						<p className="text-xs font-mono text-muted-foreground uppercase">{process.wsId.slice(0, 12)}</p>
					</div>
				</div>
				<ProcessStatusBadge status={process.status} />
			</div>

			<div className="flex flex-wrap gap-2">
				{process.shardIds.map((id) => (
					<span
						key={id}
						className="inline-flex items-center rounded-control bg-surface-2 px-2.5 py-1 text-sm font-bold text-muted-foreground transition-colors hover:text-primary-text"
					>
						샤드 {id}
					</span>
				))}
			</div>

			<div className="grid grid-cols-2 gap-4">
				{[
					{ label: "함께하는 서버", value: process.guilds.toLocaleString(), icon: Server },
					{ label: "재생 중인 노래", value: process.players.toLocaleString(), icon: RadioTower },
					{ label: "메모리", value: formatMemory(process.memoryUsage), icon: HardDrive },
					{ label: "운영 시간", value: formatUptime(process.uptime), icon: Clock3 },
				].map((item, i) => (
					<div key={i} className="rounded-xl bg-surface-2 p-4 space-y-2 group hover:bg-surface-3 transition-colors duration-fast">
						<div className="flex items-center gap-2 text-muted-foreground font-black text-xs">
							<item.icon size={12} />
							{item.label}
						</div>
						<div className="text-xl font-bold text-foreground/90">{item.value}</div>
					</div>
				))}
			</div>

			<div className="pt-2 flex items-center justify-between text-sm font-medium text-muted-foreground">
				<div className="flex items-center gap-2">
					최근 업데이트: {formatRelativeTime(process.lastHeartbeat)}
				</div>
			</div>
		</Card>
	);
}

