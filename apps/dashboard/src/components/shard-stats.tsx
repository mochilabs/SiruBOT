import { Cpu, HardDrive, RadioTower, Server } from "lucide-react";

import type { ShardAggregateStats } from "@/lib/shard-api";

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
				label="연결된 샤드"
				value={`${stats.allocatedShards} / ${stats.shardCount}`}
				sub={`${stats.processCount}개 프로세스 운영 중`}
			/>
			<StatCard icon={Server} label="함께하는 서버" value={stats.totalGuilds.toLocaleString()} sub="서버들과 함께하고 있어요" />
			<StatCard icon={Cpu} label="재생 중인 노래" value={stats.totalPlayers.toLocaleString()} sub="노래를 들려주고 있어요" />
			<StatCard icon={HardDrive} label="사용 중인 메모리" value={`${stats.totalMemoryMB} MB`} sub={`쾌적하게 관리하고 있어요`} />
		</div>
	);
}

