import type { ShardProcessInfo } from '@/lib/shard-api';
import { StatusBadge } from './status-badge';
import { Card, Flex, Text, Heading } from '@radix-ui/themes';

function formatUptime(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	if (days > 0) return `${days}일 ${hours}시간`;
	if (hours > 0) return `${hours}시간 ${minutes}분`;
	return `${minutes}분`;
}

function formatRelativeTime(timestamp: number): string {
	const diff = Math.floor((Date.now() - timestamp) / 1000);
	if (diff < 5) return '방금';
	if (diff < 60) return `${diff}초 전`;
	if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
	return `${Math.floor(diff / 3600)}시간 전`;
}

function formatMemory(bytes: number): string {
	return `${Math.round(bytes / 1024 / 1024)}MB`;
}

export function ProcessCard({ process, index }: { process: ShardProcessInfo; index: number }) {
	return (
		<Card className="bg-siru-panel border-0 rounded-[1.5rem] p-6 shadow-sm hover:shadow-md transition-shadow">
			<Flex justify="between" align="center" className="mb-5">
				<Flex align="center" gap="2">
					<div className="w-8 h-8 rounded-lg bg-siru-base flex items-center justify-center font-mono text-siru-primary font-bold text-sm">
						#{index + 1}
					</div>
					<Heading size="4" className="text-siru-text">Process</Heading>
				</Flex>
				<StatusBadge status={process.status} />
			</Flex>

			<Flex wrap="wrap" gap="2" className="mb-6 bg-siru-base p-3 rounded-xl">
				{process.shardIds.length > 0 ? process.shardIds.map((id) => (
					<span
						key={id}
						className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-mono font-semibold bg-siru-panel text-siru-text/80 shadow-sm"
					>
						Shard {id}
					</span>
				)) : <span className="text-xs text-siru-text/40">No shards</span>}
			</Flex>

			<div className="grid grid-cols-2 gap-4 mb-6">
				<div className="bg-siru-base/50 p-3 rounded-xl">
					<Text size="1" className="text-siru-text/50 block mb-1">서버</Text>
					<Text size="3" className="font-semibold text-siru-text">{process.guilds.toLocaleString()}</Text>
				</div>
				<div className="bg-siru-base/50 p-3 rounded-xl">
					<Text size="1" className="text-siru-text/50 block mb-1">플레이어</Text>
					<Text size="3" className="font-semibold text-siru-text">{process.players.toLocaleString()}</Text>
				</div>
				<div className="bg-siru-base/50 p-3 rounded-xl">
					<Text size="1" className="text-siru-text/50 block mb-1">메모리</Text>
					<Text size="3" className="font-semibold text-siru-text">{formatMemory(process.memoryUsage)}</Text>
				</div>
				<div className="bg-siru-base/50 p-3 rounded-xl">
					<Text size="1" className="text-siru-text/50 block mb-1">업타임</Text>
					<Text size="3" className="font-semibold text-siru-text">{formatUptime(process.uptime)}</Text>
				</div>
			</div>

			<Flex justify="between" align="center" className="pt-4 border-t border-siru-text/5">
				<Flex align="center" gap="2">
					<span className="w-2 h-2 rounded-full bg-siru-secondary animate-pulse"></span>
					<Text size="1" className="text-siru-text/40">마지막 하트비트: {formatRelativeTime(process.lastHeartbeat)}</Text>
				</Flex>
				<Text size="1" className="font-mono text-siru-text/30 bg-siru-base px-2 py-0.5 rounded-md">
					{process.wsId.slice(0, 8)}
				</Text>
			</Flex>
		</Card>
	);
}