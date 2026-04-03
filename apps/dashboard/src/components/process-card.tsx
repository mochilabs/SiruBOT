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
		<div className="glass-card p-5">
			<div className="flex items-center justify-between mb-4">
				<h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
					Process #{index + 1}
				</h3>
				<StatusBadge status={process.status} />
			</div>

			<div className="flex flex-wrap gap-1.5 mb-4">
				{process.shardIds.map((id) => (
					<span
						key={id}
						className="inline-flex items-center rounded-md bg-[var(--color-accent-subtle)] border border-[var(--color-border)] px-2 py-0.5 text-xs font-mono font-medium text-[var(--color-text-secondary)]"
					>
						Shard {id}
					</span>
				))}
			</div>

			<div className="grid grid-cols-2 gap-3">
				{[
					{ label: "서버", value: process.guilds.toLocaleString() },
					{ label: "플레이어", value: process.players.toLocaleString() },
					{ label: "메모리", value: formatMemory(process.memoryUsage) },
					{ label: "업타임", value: formatUptime(process.uptime) },
				].map((stat) => (
					<div key={stat.label} className="rounded-lg bg-[var(--color-bg-elevated)] p-2.5">
						<span className="text-xs text-[var(--color-text-muted)]">{stat.label}</span>
						<p className="mt-0.5 text-sm font-semibold text-[var(--color-text-primary)] tabular-nums">{stat.value}</p>
					</div>
				))}
			</div>

			<div className="mt-4 flex items-center justify-between border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-text-muted)]">
				<span>하트비트: {formatRelativeTime(process.lastHeartbeat)}</span>
				<span className="font-mono opacity-60">{process.wsId.slice(0, 8)}</span>
			</div>
		</div>
	);
}
