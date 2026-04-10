"use client";

import Image from "next/image";
import { Track as TrackType } from "@sirubot/prisma";
import { motion } from "framer-motion";
import { Crown, ExternalLink, Music4 } from "lucide-react";

interface TrackListProps {
	tracks: TrackType[];
	rankOffset?: number;
}

const listVariants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: {
			staggerChildren: 0.08,
		},
	},
} as const;

const itemVariants = {
	hidden: { opacity: 0, y: 15 },
	visible: { 
		opacity: 1, 
		y: 0,
		transition: {
			type: "spring",
			stiffness: 100,
			damping: 15
		}
	},
} as const;

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

export function TrackList({ tracks, rankOffset = 0 }: TrackListProps) {
	return (
		<motion.div 
			className="w-full space-y-2"
			variants={listVariants}
			initial="hidden"
			animate="visible"
			viewport={{ once: true }}
		>
			{tracks.map((track, index) => (
				<motion.div key={track.id} variants={itemVariants}>
					<TrackItem track={track} rank={rankOffset + index + 1} />
				</motion.div>
			))}
		</motion.div>
	);
}

export function TrackItem({ track, rank }: { track: TrackType; rank: number }) {
	const isTopThree = rank <= 3;

	return (
		<div className="glass-panel group relative flex items-center gap-3 sm:gap-4 p-3 sm:p-4 transition-colors duration-200 hover:border-primary/30">
			<div className="flex w-8 sm:w-10 justify-center">
				{isTopThree ? (
					<Crown className={`h-5 w-5 sm:h-6 sm:w-6 ${rank === 1 ? "text-secondary" : "text-primary/70"}`} />
				) : (
					<span className="text-sm sm:text-base font-medium text-muted-foreground/60">{rank}</span>
				)}
			</div>

			<div className="relative h-12 w-12 sm:h-16 sm:w-16 shrink-0 overflow-hidden rounded-lg sm:rounded-xl border border-white/10">
				{track.thumbnail ? (
					<Image 
						src={track.thumbnail} 
						alt={track.title} 
						fill 
						sizes="(max-width: 640px) 48px, 64px"
						className="object-cover" 
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center bg-muted">
						<Music4 className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground" />
					</div>
				)}
			</div>

			<div className="min-w-0 flex-1">
				<h3 className="truncate text-base sm:text-lg font-semibold text-foreground leading-tight" title={track.title}>
					{track.title}
				</h3>
				<p className="mt-0.5 truncate text-sm sm:text-base font-normal text-muted-foreground/70" title={track.artist}>
					{track.artist}
				</p>
				<p className="mt-1 text-[11px] sm:text-sm font-normal text-muted-foreground/40">{formatTimeToKorean(track.duration / 1000)}</p>
			</div>

			<div className="flex items-center gap-3 sm:gap-4 pr-1 sm:pr-2">
				<div className="text-right">
					<p className="text-base sm:text-lg font-bold text-primary leading-none">{track.totalPlays.toLocaleString()}</p>
					<p className="hidden sm:block mt-1 text-[10px] uppercase tracking-wider text-muted-foreground/40 font-semibold">Total Plays</p>
				</div>

				{track.url && (
					<a
						href={track.url}
						target="_blank"
						rel="noopener noreferrer"
						className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-xl bg-primary/10 text-primary border border-primary/20 transition-colors hover:bg-primary/20 hover:scale-105 active:scale-95"
						title="원본 트랙 열기"
					>
						<ExternalLink className="h-4 w-4 sm:h-5 sm:w-5" />
					</a>
				)}
			</div>
		</div>
	);
}

export function Track({ track }: { track: TrackType }) {
	return (
		<div className="glass-panel flex items-center gap-3 p-3 hover:border-primary/20 transition-colors">
			<div className="relative h-14 w-14 overflow-hidden rounded-lg border border-white/5">
				{track.thumbnail ? (
					<Image 
						src={track.thumbnail} 
						alt={track.title} 
						fill 
						sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
						className="object-cover" 
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center bg-muted">
						<Music4 className="h-5 w-5 text-muted-foreground" />
					</div>
				)}
			</div>
			<div className="min-w-0 flex-1">
				<h3 className="truncate text-base font-semibold text-foreground" title={track.title}>
					{track.title}
				</h3>
				<p className="truncate text-sm font-normal text-muted-foreground" title={track.artist}>
					{track.artist}
				</p>
				<p className="text-[13px] font-medium text-primary/70">{track.totalPlays.toLocaleString()} plays</p>
			</div>
		</div>
	);
}
