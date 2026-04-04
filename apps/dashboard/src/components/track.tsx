import { Track as TrackType } from "@sirubot/prisma";
import * as Avatar from "@radix-ui/react-avatar";
import * as Separator from "@radix-ui/react-separator";
import Image from "next/image";
import { Music, ExternalLink } from "lucide-react";

interface TrackListProps {
	tracks: TrackType[];
}

export function formatTimeToKorean(seconds: number): string {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = Math.floor(seconds % 60);
	const parts: string[] = [];
	if (hours > 0) parts.push(`${hours}시간`);
	if (minutes > 0 || hours > 0) parts.push(`${minutes}분`);
	if (secs > 0 || (hours === 0 && minutes === 0)) parts.push(`${secs}초`);
	return parts.join(" ");
}

export function TrackList({ tracks }: TrackListProps) {
	return (
		<div className="w-full overflow-y-auto">
			{tracks.map((track, index) => (
				<TrackItem key={track.id} track={track} rank={index + 1} isLast={index === tracks.length - 1} />
			))}
		</div>
	);
}

function TrackItem({ track, rank, isLast }: { track: TrackType; rank: number; isLast: boolean }) {
	const isTop3 = rank <= 3;

	return (
		<div className="group">
			<div className="track-row flex items-center gap-4 px-3 py-3 sm:px-4">
				<div className={`rank-badge h-8 w-8 shrink-0 text-sm font-mono ${isTop3 ? "top-3" : ""}`}>
					<span className={isTop3 ? "" : "text-[var(--color-text-muted)]"}>{rank}</span>
				</div>

				<Avatar.Root className="h-11 w-11 shrink-0 overflow-hidden rounded-lg ring-1 ring-[var(--color-border)]">
					<Avatar.Image src={track.thumbnail || undefined} alt={track.title} className="h-full w-full object-cover" />
					<Avatar.Fallback className="flex h-full w-full items-center justify-center bg-[var(--color-accent-subtle)]">
						<Music size={18} className="text-[var(--color-text-muted)]" />
					</Avatar.Fallback>
				</Avatar.Root>

				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<h3 className="truncate text-sm font-medium text-[var(--color-text-primary)]" title={track.title}>
							{track.title}
						</h3>
						<span className="shrink-0 text-xs text-[var(--color-text-muted)]">
							{formatTimeToKorean(track.duration / 1000)}
						</span>
					</div>
					<p className="mt-0.5 truncate text-xs text-[var(--color-text-secondary)]" title={track.artist}>
						{track.artist}
					</p>
				</div>

				<div className="flex shrink-0 items-center gap-3">
					<div className="text-right">
						<span className="text-sm font-medium text-[var(--color-text-secondary)] tabular-nums">
							{track.totalPlays.toLocaleString()}
						</span>
						<span className="ml-0.5 text-xs text-[var(--color-text-muted)]">회</span>
					</div>
					{track.url && (
						<a
							href={track.url}
							target="_blank"
							rel="noopener noreferrer"
							className="hidden rounded-lg p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-accent-subtle)] hover:text-[var(--color-text-secondary)] sm:block"
							title="원본 링크로 이동"
							aria-label={`${track.title} 원본 링크로 이동`}
						>
							<ExternalLink size={16} />
						</a>
					)}
				</div>
			</div>
			{!isLast && <Separator.Root className="mx-3 h-px bg-[var(--color-border)] sm:mx-4" />}
		</div>
	);
}

export function Track({ track }: { track: TrackType }) {
	return (
		<div className="glass-card flex items-center gap-3 p-3">
			{track.thumbnail ? (
				<Image src={track.thumbnail} alt={track.title} width={48} height={48} className="rounded-lg object-cover ring-1 ring-[var(--color-border)]" />
			) : (
				<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--color-accent-subtle)]">
					<Music size={20} className="text-[var(--color-text-muted)]" />
				</div>
			)}
			<div className="min-w-0 flex-1">
				<h3 className="truncate text-sm font-medium text-[var(--color-text-primary)]" title={track.title}>{track.title}</h3>
				<p className="truncate text-xs text-[var(--color-text-secondary)]" title={track.artist}>{track.artist}</p>
				<p className="text-xs text-[var(--color-text-muted)]">{track.totalPlays.toLocaleString()}회 재생</p>
			</div>
		</div>
	);
}
