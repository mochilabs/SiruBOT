import type { ShardProcessInfo } from '@/lib/shard-api';
import { StatusBadge } from './status-badge';

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
		<div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
			<div className="flex items-center justify-between mb-4">
				<h3 className="text-sm font-semibold text-gray-900">
					Process #{index + 1}
				</h3>
				<StatusBadge status={process.status} />
			</div>

			<div className="flex flex-wrap gap-1.5 mb-4">
				{process.shardIds.map((id) => (
					<span
						key={id}
						className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium bg-gray-100 text-gray-700 border border-gray-200"
					>
						Shard {id}
					</span>
				))}
			</div>

			<div className="grid grid-cols-2 gap-3 text-sm">
				<div>
					<span className="text-gray-500">서버</span>
					<p className="font-medium text-gray-900">{process.guilds.toLocaleString()}</p>
				</div>
				<div>
					<span className="text-gray-500">플레이어</span>
					<p className="font-medium text-gray-900">{process.players.toLocaleString()}</p>
				</div>
				<div>
					<span className="text-gray-500">메모리</span>
					<p className="font-medium text-gray-900">{formatMemory(process.memoryUsage)}</p>
				</div>
				<div>
					<span className="text-gray-500">업타임</span>
					<p className="font-medium text-gray-900">{formatUptime(process.uptime)}</p>
				</div>
			</div>

			<div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-xs text-gray-400">
				<span>마지막 하트비트: {formatRelativeTime(process.lastHeartbeat)}</span>
				<span className="font-mono">{process.wsId.slice(0, 8)}</span>
			</div>
		</div>
	);
}
