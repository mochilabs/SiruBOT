import { Clock3, HardDrive, RadioTower, Server } from "lucide-react";

import type { ShardProcessInfo } from "@/lib/shard-api";

import { StatusBadge } from "./status-badge";

function formatUptime(secondsValue: number): string {
	const seconds = Math.floor(secondsValue);
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	if (days > 0) return `${days}일 ${hours}시간`;
	if (hours > 0) return `${hours}시간 ${minutes}분`;
	return `${minutes}분`;
}

function formatRelativeTime(timestamp: number): string {
	const diff = Math.floor((Date.now() - timestamp) / 1000);
	if (diff < 5) return "just now";
	if (diff < 60) return `${diff}s ago`;
	if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
	return `${Math.floor(diff / 3600)}h ago`;
}

function formatMemory(bytes: number): string {
	return `${Math.round(bytes / 1024 / 1024)}MB`;
}

export function ProcessCard({ process, index }: { process: ShardProcessInfo; index: number }) {
	return (
		<div className="glass-panel p-6 space-y-6 transition-all duration-300 hover:border-primary/30">
			<div className="flex items-center justify-between gap-4">
				<div className="flex items-center gap-3">
					<div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
						<Server size={20} />
					</div>
					<div>
						<h3 className="text-lg font-black tracking-tighter text-foreground">프로세스 #{index + 1}</h3>
						<p className="text-[12px] font-mono text-muted-foreground/50 uppercase">{process.wsId.slice(0, 12)}</p>
					</div>
				</div>
				<StatusBadge status={process.status} />
			</div>

			<div className="flex flex-wrap gap-2">
				{process.shardIds.map((id) => (
					<span
						key={id}
						className="inline-flex items-center rounded-lg glass-overlay px-2.5 py-1 text-[13px] font-bold text-muted-foreground/80 transition-colors hover:border-primary/40 hover:text-primary"
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
					<div key={i} className="glass-overlay rounded-xl p-4 space-y-2 group hover:bg-foreground/5 transition-colors">
						<div className="flex items-center gap-2 text-muted-foreground/40 font-black text-[10px] tracking-widest">
							<item.icon size={12} />
							{item.label}
						</div>
						<div className="text-xl font-bold text-foreground/90">{item.value}</div>
					</div>
				))}
			</div>

			<div className="pt-2 flex items-center justify-between text-[13px] font-medium text-muted-foreground/40 border-t border-border">
				<div className="flex items-center gap-2">
					<span className="w-2 h-2 rounded-full bg-primary/40 animate-pulse" />
					최근 업데이트: {formatRelativeTime(process.lastHeartbeat)}
				</div>
			</div>
		</div>
	);
}

