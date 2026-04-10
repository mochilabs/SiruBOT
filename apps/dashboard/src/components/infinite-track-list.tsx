"use client";

import { useState, useEffect, useCallback } from "react";
import { useInView } from "react-intersection-observer";
import { Track as TrackType } from "@sirubot/prisma";
import { getTracksAction } from "@/app/actions/track-actions";
import { TrackItem } from "./track";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

interface InfiniteTrackListProps {
	initialTracks: TrackType[];
	rankOffset?: number;
}

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

export function InfiniteTrackList({ initialTracks, rankOffset = 0 }: InfiniteTrackListProps) {
	const [tracks, setTracks] = useState<TrackType[]>(initialTracks);
	const [page, setPage] = useState(2); // Start from page 2
	const [hasMore, setHasMore] = useState(initialTracks.length >= 10);
	const [loading, setLoading] = useState(false);

	const { ref, inView } = useInView({
		threshold: 0.1,
		triggerOnce: false,
	});

	const loadMoreTracks = useCallback(async () => {
		setLoading(true);
		try {
			const newTracks = await getTracksAction(page);
			if (newTracks.length === 0) {
				setHasMore(false);
			} else {
				setTracks((prev) => [...prev, ...newTracks]);
				setPage((prev) => prev + 1);
				if (newTracks.length < 20) {
					setHasMore(false);
				}
			}
		} catch (error) {
			console.error("Failed to fetch more tracks:", error);
			setHasMore(false);
		} finally {
			setLoading(false);
		}
	}, [page]);

	useEffect(() => {
		if (inView && hasMore && !loading) {
			loadMoreTracks();
		}
	}, [inView, hasMore, loading, loadMoreTracks]);

	return (
		<div className="w-full space-y-4 pb-20">
			<div className="space-y-2">
				{tracks.map((track, index) => (
					<motion.div 
						key={`${track.id}-${index}`}
						variants={itemVariants}
						initial="hidden"
						animate="visible"
						viewport={{ once: true }}
					>
						<TrackItem track={track} rank={rankOffset + index + 1} />
					</motion.div>
				))}
			</div>

			{/* Bottom Indicator / Ref */}
			<div ref={ref} className="w-full py-12 flex justify-center items-center">
				{loading && (
					<div className="flex flex-col items-center gap-4 text-primary">
						<Loader2 className="w-8 h-8 animate-spin" />
						<span className="text-sm font-bold animate-pulse">더 많은 곡을 가져오는 중...</span>
					</div>
				)}
				{!hasMore && tracks.length > 0 && (
					<div className="text-muted-foreground/40 text-sm font-bold uppercase tracking-[0.2em]">
						End of Chart
					</div>
				)}
			</div>
		</div>
	);
}
