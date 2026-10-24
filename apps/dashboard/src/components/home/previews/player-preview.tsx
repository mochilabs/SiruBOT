"use client";

import { useEffect, useState } from "react";
import { useInView } from "react-intersection-observer";
import Image from "next/image";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { ListMusic, Pause, Repeat, SkipForward } from "lucide-react";

import { cn } from "@/lib/utils";

import { fmtTime, PLAYLIST_TRACKS, PREVIEW_TAIL_SECONDS, toSeconds } from "./tracks";

/**
 * 음악 컨트롤러 프리뷰 — 실제 재생처럼 진행도가 흐르고 곡이 순환하는 embed.
 * 초 단위 시계가 진행 바·시간 배지를 밀고, 곡이 끝나면 건너뛰기 버튼이 반응한 뒤
 * 다음 곡 제목·썸네일로 크로스페이드해요. reduced-motion에선 시계를 멈춘 정지 화면을 보여줘요.
 * 화면에 보일 때만 시계가 흘러요(useInView).
 *
 * 곡이 넘어갈 때 제목 블록은 높이가 고정(line-clamp-2)이라 제자리 크로스페이드만으로
 * 넘어가요 — 이동이 섞이면 컨테이너 전체가 출렁여요.
 */
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

	// 곡 끝 지점에서 잠깐 머문 뒤 다음 곡으로 넘어가요 — 건너뛰기를 누른 것처럼
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
		// 데모 패널을 여러 겹으로 쌓아 depth를 만들어요 — 부유 카드는 실제 제품 상태(대기열 1곡 추가)예요
		<div ref={ref} className="relative pb-16 pr-2">
			<div className="flex flex-col gap-3 rounded-card bg-discord-embed p-3 sm:p-4">
				<div className="flex gap-3">
					<div className="flex min-w-0 flex-1 flex-col justify-between gap-1.5">
						<p className="text-2xs text-discord-text-muted">🎵 #음악-라운지 에서 재생 중 • 대기열 4곡 · 12:36 남음</p>
						{/* 곡 제목·아티스트 — 높이가 고정된 블록이라 건너뛰기 없이 제자리 페이드만으로 넘어가요 */}
						<AnimatePresence mode="wait" initial={false}>
							<m.div
								key={track.title}
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{ duration: 0.25, ease: "easeOut" }}
							>
								<p className="line-clamp-2 text-sm font-bold leading-snug text-discord-text underline decoration-discord-text/20 underline-offset-2">
									{track.title}
								</p>
						</m.div>
					</AnimatePresence>
					<p className="truncate text-2xs text-discord-text-muted">
						아티스트: {track.artist} • 신청자: <span className="rounded-sm bg-discord-primary/20 px-1 text-discord-light">@사용자</span>
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
								transition={{ duration: 0.4 }}
							>
								<Image src={track.thumbnail} alt="" fill className="object-cover" sizes="80px" unoptimized />
							</m.div>
						</AnimatePresence>
					</div>
				</div>
				{/* ActionRow — ⏮ ⏸ ⏭ 🔂 📄 대기열. 곡이 끝나가는 동안 건너뛰기 버튼이 밝아져요 */}
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
				{/* Separator + Footer — 실제 봇의 buildFooterSegments와 동일 */}
				<div className="flex items-center justify-between border-t border-discord-btn-active pt-2">
					<p className="text-2xs text-discord-text-muted">📡 시루-노드-01 • 🔊 100%</p>
					<span className="rounded-sm bg-discord-primary/10 px-1.5 py-1 text-2xs font-semibold text-discord-light">
						{fmtTime(seconds)} / {track.duration}
					</span>
				</div>
			</div>
			<div
				aria-hidden
				className="absolute bottom-0 left-2 w-60 -rotate-2 space-y-1.5 rounded-card bg-surface-1 p-3 shadow-lg sm:left-6"
			>
				<p className="text-2xs font-medium text-muted-foreground">대기열에 추가됨</p>
				<div className="flex items-center gap-2">
					<span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-sm">
						<Image src={PLAYLIST_TRACKS[2].thumbnail} alt="" fill className="object-cover" sizes="32px" unoptimized />
					</span>
					<div className="min-w-0">
						<p className="truncate text-xs font-bold text-foreground">아이돌 (Idol)</p>
						<p className="truncate text-2xs text-muted-foreground">YOASOBI</p>
					</div>
					<span className="ml-auto shrink-0 rounded-sm bg-primary/10 px-1.5 py-0.5 text-2xs font-bold text-primary-text">+1곡</span>
				</div>
			</div>
			<div aria-hidden className="absolute -top-4 right-3 rotate-2 rounded-card bg-surface-1 p-2.5 shadow-lg sm:right-5">
				<span className="text-xs font-bold text-primary-text sm:text-sm">/음악 재생</span>
			</div>
		</div>
	);
}