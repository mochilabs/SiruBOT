"use client";

import { useEffect, useState } from "react";
import { useInView } from "react-intersection-observer";
import Image from "next/image";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { ListMusic, Pause, Repeat, SkipForward } from "lucide-react";

import { motionBase } from "@/components/motion/durations";
import { cn } from "@/lib/utils";

import { fmtTime, PLAYLIST_TRACKS, PREVIEW_TAIL_SECONDS, toSeconds } from "./tracks";

export function PlayerPreview() {
	const shouldReduce = useReducedMotion();
	const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.3 });
	const [trackIndex, setTrackIndex] = useState(0);
	const [seconds, setSeconds] = useState(() => Math.max(0, toSeconds(PLAYLIST_TRACKS[0].duration) - PREVIEW_TAIL_SECONDS));
	const track = PLAYLIST_TRACKS[trackIndex];
	const durationSeconds = toSeconds(track.duration);
	const advancing = seconds >= durationSeconds;

	useEffect(() => {
		if (shouldReduce || !inView) return undefined;
		const timer = setInterval(() => {
			setSeconds((current) => Math.min(current + 1, durationSeconds));
		}, 1000);
		return () => clearInterval(timer);
	}, [durationSeconds, inView, shouldReduce]);

	useEffect(() => {
		if (shouldReduce || !inView || !advancing) return undefined;
		const timer = setTimeout(() => {
			const next = (trackIndex + 1) % PLAYLIST_TRACKS.length;
			setTrackIndex(next);
			setSeconds(Math.max(0, toSeconds(PLAYLIST_TRACKS[next].duration) - PREVIEW_TAIL_SECONDS));
		}, 900);
		return () => clearTimeout(timer);
	}, [advancing, inView, shouldReduce, trackIndex]);

	return (
		<div ref={ref} className="space-y-3">
			<div className="flex flex-col gap-3 rounded-card bg-discord-embed p-3 sm:p-4">
				<div className="flex gap-3">
					<div className="flex min-w-0 flex-1 flex-col justify-between gap-1.5">
						<p className="text-2xs text-discord-text-muted">재생 중 #음악-라운지</p>
						<AnimatePresence mode="wait" initial={false}>
							<m.div
								key={track.title}
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{ duration: motionBase, ease: "easeOut" }}
							>
								<p className="line-clamp-2 text-sm font-bold leading-snug text-discord-text underline decoration-discord-text/20 underline-offset-2">
									{track.title}
								</p>
						</m.div>
					</AnimatePresence>
					<p className="truncate text-2xs text-discord-text-muted">
						💿 {track.artist} <span className="rounded-sm bg-discord-primary/20 px-1 text-discord-light">@사용자</span>
					</p>
						<div className="flex items-center gap-2 text-2xs tabular-nums text-discord-text-muted">
							<span>
								{fmtTime(seconds)} / {track.duration}
							</span>
							<div className="h-1 flex-1 overflow-hidden rounded-full bg-discord-btn-active">
								<m.div
									className="h-full rounded-full bg-primary-control"
									animate={{ width: `${(seconds / durationSeconds) * 100}%` }}
									transition={{ duration: 1.05, ease: "linear" }}
								/>
							</div>
						</div>
					</div>
					<div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-discord-btn-active sm:h-20 sm:w-20">
						<AnimatePresence mode="popLayout" initial={false}>
							<m.div
								key={track.thumbnail}
								className="absolute inset-0"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{ duration: motionBase }}
							>
								<Image src={track.thumbnail} alt="" fill className="object-cover" sizes="80px" unoptimized />
							</m.div>
						</AnimatePresence>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<span className="flex h-8 w-10 items-center justify-center rounded-md bg-discord-btn-active text-discord-text" aria-hidden>
						<SkipForward size={13} className="rotate-180" fill="currentColor" />
					</span>
					<span className="flex h-8 w-10 items-center justify-center rounded-md bg-discord-btn-active text-discord-text" aria-hidden>
						<Pause size={13} fill="currentColor" />
					</span>
					<span
						className={cn(
							"flex h-8 w-10 items-center justify-center rounded-md transition-colors duration-fast",
							advancing ? "bg-discord-btn-hover text-discord-text" : "bg-discord-btn-active text-discord-text-muted",
						)}
						aria-hidden
					>
						<SkipForward size={13} fill="currentColor" />
					</span>
					<span className="flex h-8 w-10 items-center justify-center rounded-md bg-discord-btn-active text-discord-text" aria-hidden>
						<Repeat size={13} />
					</span>
					<span className="flex h-8 items-center gap-1.5 rounded-md bg-discord-btn-active px-2.5 text-2xs font-semibold text-discord-text" aria-hidden>
						<ListMusic size={12} />
						대기열
					</span>
				</div>
				<div className="flex items-center justify-between border-t border-discord-btn-active pt-2">
					<p className="text-2xs text-discord-text-muted">📡 시루-노드-01 🔊 100%</p>
					<span className="rounded-sm bg-discord-primary/10 px-1.5 py-1 text-2xs font-semibold text-discord-light">
						{fmtTime(seconds)} / {track.duration}
					</span>
				</div>
			</div>
		</div>
	);
}