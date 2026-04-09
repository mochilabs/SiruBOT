import type { ShardAggregateStats } from '@/lib/shard-api';
import { Card, Flex, Text, Heading } from '@radix-ui/themes';

interface StatCardProps {
	label: string;
	value: string;
	icon: string;
	sub?: string;
}

function StatCard({ label, value, icon, sub }: StatCardProps) {
	return (
		<Card className="bg-siru-panel border-0 rounded-[1.5rem] p-6 hover:shadow-siru-glow transition-shadow duration-300">
			<Flex direction="column" gap="2">
				<Flex align="center" gap="3" className="mb-2">
					<div className="w-10 h-10 rounded-xl bg-siru-base flex items-center justify-center shadow-sm">
						<span className="text-xl">{icon}</span>
					</div>
					<Text className="text-siru-text/60 font-medium">{label}</Text>
				</Flex>
				<Heading size="7" className="text-siru-text tracking-tight">{value}</Heading>
				{sub && <Text size="2" className="text-siru-text/40 font-medium mt-1">{sub}</Text>}
			</Flex>
		</Card>
	);
}

export function ShardStats({ stats }: { stats: ShardAggregateStats }) {
	return (
		<div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
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