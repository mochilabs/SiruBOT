import React, { useState, memo } from "react";
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
			staggerChildren: 0.05, // Slightly faster stagger
		},
	},
} as const;

const itemVariants = {
	hidden: { opacity: 0, y: 10 }, // Reduced y distance
	visible: { 
		opacity: 1, 
		y: 0,
		transition: {
			type: "spring",
			stiffness: 120,
			damping: 20
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

function MockThumbnail({ className, title }: { className: string; title: string }) {
	return (
		<div className={`flex flex-col items-center justify-center bg-gradient-to-br from-primary/20 via-primary/5 to-secondary/20 relative ${className}`}>
			<div className="absolute inset-0 bg-foreground/5 backdrop-blur-sm" />
			<Music4 className="h-1/3 w-1/3 text-primary/40 relative z-10" />
			<span className="absolute bottom-1 right-1 text-[8px] font-black text-primary/20 uppercase tracking-tighter select-none z-10">
				No Image
			</span>
		</div>
	);
}

export const TrackList = memo(function TrackList({ tracks, rankOffset = 0 }: TrackListProps) {
	return (
		<motion.div 
			className="w-full space-y-2"
			variants={listVariants}
			initial="hidden"
			animate="visible"
		>
			{tracks.map((track, index) => (
				<motion.div 
					key={track.id} 
					variants={itemVariants} 
					className="will-change-transform"
				>
					<TrackItem track={track} rank={rankOffset + index + 1} />
				</motion.div>
			))}
		</motion.div>
	);
});

export const TrackItem = memo(function TrackItem({ track, rank }: { track: TrackType; rank: number }) {
	const [imgError, setImgError] = useState(false);
	const isTopThree = rank <= 3;

	return (
		<div className="glass-panel group relative flex items-center gap-3 sm:gap-4 p-3 sm:p-4 hover:border-primary/30 transition-all duration-200">
			{/* Desktop Rank Indicator */}
			<div className="hidden sm:flex w-10 justify-center shrink-0">
				{isTopThree ? (
					<Crown className={`h-6 w-6 ${rank === 1 ? "text-secondary" : rank === 2 ? "text-discord-btn-hover/90" : "text-muted-foreground/70"}`} />
				) : (
					<span className="text-base font-bold text-muted-foreground/60">{rank}</span>
				)}
			</div>

			<div className="relative h-12 w-12 sm:h-16 sm:w-16 shrink-0 overflow-hidden rounded-lg sm:rounded-xl border border-border bg-muted/20">
				{/* Mobile Rank Overlay */}
				<div className="absolute top-0 left-0 z-10 sm:hidden flex items-center justify-center min-w-[20px] h-5 bg-black/60 backdrop-blur-md rounded-br-lg border-r border-b border-white/20 px-1.5 shadow-lg">
					{isTopThree ? (
						<Crown className={`h-3 w-3 ${rank === 1 ? "text-secondary" : rank === 2 ? "text-discord-btn-hover/90" : "text-muted-foreground/70"}`} />
					) : (
						<span className="text-[10px] font-black tracking-tighter text-white">{rank}</span>
					)}
				</div>

				{track.thumbnail && !imgError ? (
					<Image 
						src={track.thumbnail} 
						alt={track.title} 
						fill 
						sizes="64px"
						className="object-cover"
						onError={() => setImgError(true)}
					/>
				) : (
					<MockThumbnail className="h-full w-full" title={track.title} />
				)}
			</div>

			<div className="min-w-0 flex-1">
				<h3 className="truncate text-base sm:text-lg font-black text-foreground leading-tight" title={track.title}>
					{track.title}
				</h3>
				<p className="mt-0.5 truncate text-sm sm:text-base font-bold text-muted-foreground/70" title={track.artist}>
					{track.artist}
				</p>
				<p className="mt-1 text-[11px] sm:text-sm font-medium text-muted-foreground/40">{formatTimeToKorean(track.duration / 1000)}</p>
			</div>

			<div className="flex items-center gap-3 sm:gap-4 pr-1 sm:pr-2 shrink-0">
				<div className="text-right">
					<p className="text-base sm:text-lg font-black text-primary leading-none">{track.totalPlays.toLocaleString()}</p>
					<p className="hidden sm:block mt-1 text-[10px] uppercase tracking-wider text-muted-foreground/40 font-bold">Total Plays</p>
				</div>

				{track.url && (
					<a
						href={track.url}
						target="_blank"
						rel="noopener noreferrer"
						className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-xl bg-primary/10 text-primary border border-primary/20 transition-all hover:bg-primary/20 hover:scale-105 active:scale-95"
						title="원본 보기"
					>
						<ExternalLink className="h-4 w-4 sm:h-5 sm:w-5" />
					</a>
				)}
			</div>
		</div>
	);
});

export function Track({ track }: { track: TrackType }) {
	return (
		<div className="glass-panel flex items-center gap-3 p-3 hover:border-primary/20 transition-colors">
			<div className="relative h-14 w-14 overflow-hidden rounded-lg border border-border">
				{track.thumbnail ? (
					<Image 
						src={track.thumbnail} 
						alt={track.title} 
						fill 
						sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
						className="object-cover" 
					/>
				) : (
					<MockThumbnail className="h-full w-full" title={track.title} />
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
