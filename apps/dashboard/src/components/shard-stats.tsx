"use client";

import { Cpu, HardDrive, RadioTower, Server } from "lucide-react";

import { StatCard } from "@/components/data/stat-card";
import type { ShardAggregateStats } from "@/lib/shard-api";

export function ShardStats({ stats }: { stats: ShardAggregateStats }) {
	return (
		<div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
			<StatCard
				icon={RadioTower}
				label="연결된 샤드"
				value={`${stats.allocatedShards} / ${stats.shardCount}`}
				sub={`${stats.processCount}개 프로세스 운영 중`}
			/>
			<StatCard icon={Server} label="함께하는 서버" value={stats.totalGuilds.toLocaleString()} sub="서버들과 함께하고 있어요" />
			<StatCard icon={Cpu} label="재생 중인 노래" value={stats.totalPlayers.toLocaleString()} sub="노래를 들려주고 있어요" />
			<StatCard icon={HardDrive} label="사용 중인 메모리" value={`${stats.totalMemoryMB} MB`} sub="쾌적하게 관리하고 있어요" />
		</div>
	);
}
