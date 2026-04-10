import type { ShardAggregateStats } from "@/lib/shard-api";
import { Cpu, HardDrive, RadioTower, Server } from "lucide-react";

interface StatCardProps {
	label: string;
	value: string;
	sub?: string;
	icon: React.ComponentType<{ className?: string }>;
}

function StatCard({ label, value, sub, icon: Icon }: StatCardProps) {
	return (
		<div className="glass-panel p-6 space-y-4 hover:border-primary/40 transition-all group">
			<div className="flex items-center justify-between">
				<div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 group-hover:scale-110 group-hover:rotate-3 transition-all">
					<Icon className="h-6 w-6" />
				</div>
				<p className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">{label}</p>
			</div>
			<div className="space-y-1">
				<p className="text-3xl font-black tracking-tighter text-foreground">{value}</p>
				{sub ? <p className="text-sm font-medium text-muted-foreground/60">{sub}</p> : null}
			</div>
		</div>
	);
}

export function ShardStats({ stats }: { stats: ShardAggregateStats }) {
	return (
		<div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
			<StatCard
				icon={RadioTower}
				label="할당된 샤드"
				value={`${stats.allocatedShards} / ${stats.shardCount}`}
				sub={`${stats.processCount} 클러스터 활성화`}
			/>
			<StatCard icon={Server} label="연결된 서버" value={stats.totalGuilds.toLocaleString()} sub="서버에서 사용 중" />
			<StatCard icon={Cpu} label="활성화된 플레이어" value={stats.totalPlayers.toLocaleString()} sub="플레이어에서 재생 중" />
			<StatCard icon={HardDrive} label="클러스터 메모리" value={`${stats.totalMemoryMB} MB`} sub={`메모리 사용 중`} />
		</div>
	);
}

