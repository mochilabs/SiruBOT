import type { ShardAggregateStats } from '@/lib/shard-api';

interface StatCardProps {
	label: string;
	value: string;
	icon: string;
	sub?: string;
}

function StatCard({ label, value, icon, sub }: StatCardProps) {
	return (
		<div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
			<div className="flex items-center gap-3 mb-1">
				<span className="text-2xl">{icon}</span>
				<span className="text-sm font-medium text-gray-500">{label}</span>
			</div>
			<p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
			{sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
		</div>
	);
}

export function ShardStats({ stats }: { stats: ShardAggregateStats }) {
	return (
		<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
			<StatCard
				icon="🔗"
				label="Shards"
				value={`${stats.allocatedShards} / ${stats.shardCount}`}
				sub={`${stats.processCount}개 프로세스`}
			/>
			<StatCard
				icon="🏠"
				label="Servers"
				value={stats.totalGuilds.toLocaleString()}
			/>
			<StatCard
				icon="🎵"
				label="Players"
				value={stats.totalPlayers.toLocaleString()}
			/>
			<StatCard
				icon="💾"
				label="Memory"
				value={`${stats.totalMemoryMB}MB`}
				sub={`${stats.shardsPerProcess}개/프로세스`}
			/>
		</div>
	);
}
