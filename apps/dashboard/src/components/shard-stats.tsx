import type { ShardAggregateStats } from '@/lib/shard-api';
import { Link2, Building2, Music, Database } from 'lucide-react';

interface StatCardProps {
	label: string;
	value: string;
	icon: React.ReactNode;
	sub?: string;
}

function StatCard({ label, value, icon, sub }: StatCardProps) {
	return (
		<div className="stat-card p-5">
			<div className="flex items-center gap-3 mb-3">
				<div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-accent-subtle)] border border-[var(--color-border-accent)] text-[var(--color-accent)]">
					{icon}
				</div>
				<span className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">{label}</span>
			</div>
			<p className="text-2xl font-bold text-[var(--color-text-primary)] tabular-nums">{value}</p>
			{sub && <p className="mt-1 text-xs text-[var(--color-text-muted)]">{sub}</p>}
		</div>
	);
}

export function ShardStats({ stats }: { stats: ShardAggregateStats }) {
	return (
		<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
			<StatCard
				icon={<Link2 size={16} />}
				label="Shards"
				value={`${stats.allocatedShards} / ${stats.shardCount}`}
				sub={`${stats.processCount}개 프로세스`}
			/>
			<StatCard
				icon={<Building2 size={16} />}
				label="Servers"
				value={stats.totalGuilds.toLocaleString()}
			/>
			<StatCard
				icon={<Music size={16} />}
				label="Players"
				value={stats.totalPlayers.toLocaleString()}
			/>
			<StatCard
				icon={<Database size={16} />}
				label="Memory"
				value={`${stats.totalMemoryMB}MB`}
				sub={`${stats.shardsPerProcess}개/프로세스`}
			/>
		</div>
	);
}
