"use client";

import React, { memo, useCallback, useMemo, useState } from "react";
import { useInView } from "react-intersection-observer";
import Image from "next/image";
import { Track as TrackType } from "@sirubot/prisma";
import { Crown, ExternalLink, Heart, Music4 } from "lucide-react";
import useSWR from "swr";

import { useToast } from "@/components/feedback/toast";

interface TrackListProps {
	tracks: TrackType[];
	rankOffset?: number;
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

	function MockThumbnail({ className }: { className: string }) {
		return (
			<div className={`flex flex-col items-center justify-center bg-gradient-to-br from-primary/20 via-primary/5 to-secondary/20 relative ${className}`}>
				<Music4 className="h-1/3 w-1/3 text-primary-text relative z-10" />
				<span className="absolute bottom-1 right-1 text-[8px] font-black text-primary/20 uppercase tracking-tighter select-none z-10">
					No Image
				</span>
			</div>
		);
	}

const BATCH_SIZE = 10;

export const TrackList = memo(function TrackList({ tracks, rankOffset = 0 }: TrackListProps) {
	const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
	const { favoriteIds, toggle } = useFavoriteIds(tracks.slice(0, visibleCount).map((t) => t.id));

	const { ref: sentinelRef } = useInView({
		onChange: (inView) => {
			if (inView && visibleCount < tracks.length) {
				setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, tracks.length));
			}
		},
		rootMargin: "300px",
	});

	const visibleTracks = tracks.slice(0, visibleCount);

	return (
		<div className="w-full space-y-2">
			{visibleTracks.map((track, index) => (
				<AnimatedTrackItem
					key={track.id}
					track={track}
					rank={rankOffset + index + 1}
					staggerIndex={index % BATCH_SIZE}
					favorite={favoriteIds.has(track.id)}
					onToggleFavorite={toggle}
				/>
			))}
			{visibleCount < tracks.length && (
				<div ref={sentinelRef} className="h-px" />
			)}
		</div>
	);
});

const AnimatedTrackItem = memo(function AnimatedTrackItem({
	track,
	rank,
	staggerIndex,
	favorite,
	onToggleFavorite,
}: {
	track: TrackType;
	rank: number;
	staggerIndex: number;
	favorite: boolean;
	onToggleFavorite: (trackId: string) => Promise<void>;
}) {
	const { ref, inView } = useInView({
		triggerOnce: true,
		threshold: 0.05,
	});

	const delay = staggerIndex * 50;

	return (
		<div
			ref={ref}
			style={{
				opacity: inView ? 1 : 0,
				transform: inView ? "none" : "translateY(16px)",
				transition: `opacity 0.3s ease-out ${delay}ms, transform 0.3s ease-out ${delay}ms`,
			}}
		>
			<TrackItem track={track} rank={rank} favorite={favorite} onToggleFavorite={onToggleFavorite} />
		</div>
	);
});

/* ─────────────────────────── 즐겨찾기 (원클릭) ─────────────────────────── */

/**
 * 현재 사용자의 즐겨찾기 트랙 ID 집합 (페이지 로드 시 일괄 조회).
 * 클릭 → 캐시 낙관 업데이트(revalidate: false) → POST/DELETE → finally 재검증 순서.
 */
function useFavoriteIds(trackIds: string[]) {
	const key = trackIds.length > 0 ? `/api/favorites?trackIds=${encodeURIComponent(trackIds.join(","))}` : null;
	const { data, mutate } = useSWR<{ trackIds: string[] }>(key);

	const favoriteIds = useMemo(() => new Set(data?.trackIds ?? []), [data]);

	const toggle = useCallback(
		async (trackId: string) => {
			const current = new Set(data?.trackIds ?? []);
			const wasFavorite = current.has(trackId);
			// 낙관적 업데이트 — 성공 여부와 무관하게 마지막에 재검증
			current[wasFavorite ? "delete" : "add"](trackId);
			await mutate({ trackIds: [...current] }, { revalidate: false });
			try {
				const res = await fetch(
					wasFavorite ? `/api/favorites?trackId=${encodeURIComponent(trackId)}` : "/api/favorites",
					wasFavorite
						? { method: "DELETE" }
						: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trackId }) },
				);
				const json = (await res.json().catch(() => ({}))) as { error?: string; alreadyRemoved?: boolean };
				if (!res.ok && res.status !== 409 && !(res.status === 404 && json.alreadyRemoved)) {
					throw new Error(json.error || "요청을 처리하지 못했어요.");
				}
			} finally {
				await mutate();
			}
		},
		[data, mutate],
	);

	return { favoriteIds, toggle };
}

/** 트랙 아이템에 표시되는 하트 토글 — 클릭 한 번으로 즐겨찾기 추가/제거 */
function FavoriteButton({
	trackId,
	favorite,
	onToggle,
}: {
	trackId: string;
	favorite: boolean;
	onToggle: (trackId: string) => Promise<void>;
}) {
	const [pending, setPending] = useState(false);
	const toast = useToast();

	const handleClick = async (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (pending) return;
		setPending(true);
		try {
			await onToggle(trackId);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "즐겨찾기 처리에 실패했어요.");
		} finally {
			setPending(false);
		}
	};

	return (
		<button
			type="button"
			onClick={handleClick}
			disabled={pending}
			title={favorite ? "즐겨찾기 제거" : "즐겨찾기에 추가"}
			className={`flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-control border transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50 ${
				favorite
					? "border-primary/30 bg-primary/10 text-primary-text hover:bg-primary/20"
					: "border-border bg-surface-2 text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-primary-text"
			}`}
		>
			<Heart className="h-4 w-4 sm:h-5 sm:w-5" fill={favorite ? "currentColor" : "none"} aria-hidden />
			<span className="sr-only">{favorite ? "즐겨찾기 제거" : "즐겨찾기에 추가"}</span>
		</button>
	);
}

export const TrackItem = memo(function TrackItem({
	track,
	rank,
	favorite,
	onToggleFavorite,
}: {
	track: TrackType;
	rank: number;
	favorite: boolean;
	onToggleFavorite: (trackId: string) => Promise<void>;
}) {
	const [imgError, setImgError] = useState(false);
	const isTopThree = rank <= 3;

	return (
		<div className="bg-surface-1 border border-border-subtle rounded-card group relative flex items-center gap-3 sm:gap-4 p-3 sm:p-4 hover:border-primary/30 transition-colors duration-fast">
			{/* Desktop Rank Indicator */}
			<div className="hidden sm:flex w-10 justify-center shrink-0">
				{isTopThree ? (
					<Crown className={`h-6 w-6 ${rank === 1 ? "text-secondary" : rank === 2 ? "text-discord-btn-hover/90" : "text-muted-foreground"}`} />
				) : (
					<span className="text-base font-bold text-muted-foreground">{rank}</span>
				)}
			</div>

			<div className="relative h-12 w-12 sm:h-16 sm:w-16 shrink-0 overflow-hidden rounded-lg sm:rounded-xl border border-border bg-muted/20">
				{/* Mobile Rank Overlay */}
				<div className="absolute top-0 left-0 z-10 sm:hidden flex items-center justify-center min-w-[20px] h-5 bg-surface-3 rounded-br-lg border-r border-b border-border px-1.5 shadow-sm">
					{isTopThree ? (
						<Crown className={`h-3 w-3 ${rank === 1 ? "text-secondary" : rank === 2 ? "text-discord-btn-hover/90" : "text-muted-foreground"}`} />
					) : (
						<span className="text-xs font-black tracking-tighter text-foreground">{rank}</span>
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
					<MockThumbnail className="h-full w-full" />
				)}
			</div>

			<div className="min-w-0 flex-1">
				<h3 className="truncate text-base sm:text-lg font-black text-foreground leading-tight" title={track.title}>
					{track.title}
				</h3>
				<p className="mt-0.5 truncate text-sm sm:text-base font-bold text-muted-foreground" title={track.artist}>
					{track.artist}
				</p>
				<p className="mt-1 text-xs sm:text-sm font-medium text-muted-foreground">{formatTimeToKorean(track.duration / 1000)}</p>
			</div>

			<div className="flex items-center gap-3 sm:gap-4 pr-1 sm:pr-2 shrink-0">
				<div className="text-right">
					<p className="text-base sm:text-lg font-black text-primary-text leading-none">{track.totalPlays.toLocaleString()}</p>
					<p className="hidden sm:block mt-1 text-xs uppercase tracking-wider text-muted-foreground font-bold">Total Plays</p>
				</div>

				{onToggleFavorite && (
					<FavoriteButton trackId={track.id} favorite={favorite} onToggle={onToggleFavorite} />
				)}

				{track.url && (
					<a
						href={track.url}
						target="_blank"
						rel="noopener noreferrer"
						className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-control bg-primary/10 text-primary-text border border-primary/20 transition-colors duration-fast hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
						title="원본 보기"
					>
						<ExternalLink className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
					</a>
				)}
			</div>
		</div>
	);
});

export function Track({ track }: { track: TrackType }) {
	return (
		<div className="bg-surface-1 border border-border-subtle rounded-card flex items-center gap-3 p-3 hover:border-primary/20 transition-colors duration-fast">
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
					<MockThumbnail className="h-full w-full" />
				)}
			</div>
			<div className="min-w-0 flex-1">
				<h3 className="truncate text-base font-semibold text-foreground" title={track.title}>
					{track.title}
				</h3>
				<p className="truncate text-sm font-normal text-muted-foreground" title={track.artist}>
					{track.artist}
				</p>
				<p className="text-sm font-medium text-primary-text">{track.totalPlays.toLocaleString()} plays</p>
			</div>
		</div>
	);
}
