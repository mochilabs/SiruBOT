"use client";

import React, { memo, useCallback, useMemo, useState } from "react";
import { useInView } from "react-intersection-observer";
import Image from "next/image";
import type { Track as TrackType } from "@sirubot/prisma";
import { formatTimeToKorean } from "@sirubot/utils/time";
import { Crown, Heart } from "lucide-react";
import useSWR from "swr";

import { MockThumbnail } from "@/components/primitives/mock-thumbnail";
import { TrackListenLink } from "@/components/track-listen-link";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import type { ChartEntry } from "@/lib/track-chart";

interface TrackListProps {
	entries: ChartEntry[];
	/** 재생 수 아래 붙는 기간 라벨 (예: "주간 재생") */
	playsLabel: string;
}

const BATCH_SIZE = 10;

export const TrackList = memo(function TrackList({ entries, playsLabel }: TrackListProps) {
	const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
	const { favoriteIds, toggle } = useFavoriteIds(
		entries.slice(0, visibleCount).flatMap((e) => (e.trackId ? [e.trackId] : [])),
	);

	const { ref: sentinelRef } = useInView({
		onChange: (inView) => {
			if (inView && visibleCount < entries.length) {
				setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, entries.length));
			}
		},
		rootMargin: "300px",
	});

	const visibleEntries = entries.slice(0, visibleCount);

	return (
		<div className="w-full space-y-2">
			{visibleEntries.map((entry, index) => (
				<AnimatedTrackItem
					key={entry.id}
					entry={entry}
					playsLabel={playsLabel}
					staggerIndex={index % BATCH_SIZE}
					favorite={entry.trackId ? favoriteIds.has(entry.trackId) : false}
					onToggleFavorite={toggle}
				/>
			))}
			{visibleCount < entries.length && (
				<div ref={sentinelRef} className="h-px" />
			)}
		</div>
	);
});

const AnimatedTrackItem = memo(function AnimatedTrackItem({
	entry,
	playsLabel,
	staggerIndex,
	favorite,
	onToggleFavorite,
}: {
	entry: ChartEntry;
	playsLabel: string;
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
				transition: `opacity var(--motion-base) var(--ease-out-expo) ${delay}ms, transform var(--motion-base) var(--ease-out-expo) ${delay}ms`,
			}}
		>
			<TrackItem entry={entry} playsLabel={playsLabel} favorite={favorite} onToggleFavorite={onToggleFavorite} />
		</div>
	);
});

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
			className={`flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-control transition-colors duration-fast shadow-control-boundary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
				favorite
					? "bg-primary-control text-primary-control-text hover:bg-primary-control-hover"
					: "bg-secondary text-muted-foreground hover:bg-surface-3 hover:text-foreground"
			}`}
		>
			<Heart className="h-4 w-4 sm:h-5 sm:w-5" fill={favorite ? "currentColor" : "none"} aria-hidden />
			<span className="sr-only">{favorite ? "즐겨찾기 제거" : "즐겨찾기에 추가"}</span>
		</button>
	);
}

const SOURCE_LABELS: Record<string, string> = {
	spotify: "Spotify",
	applemusic: "Apple Music",
	deezer: "Deezer",
	youtubemusic: "YouTube Music",
	youtube: "YouTube",
	soundcloud: "SoundCloud",
};

/** 직전 같은 길이 기간 대비 순위 변화 — ▲상승 ▼하락 NEW 신규 –유지 */
function RankChange({ change }: { change: ChartEntry["rankChange"] }) {
	if (change === null) return null;
	if (change === "new") {
		return (
			<Badge variant="primary" size="sm" title="이번 기간에 새로 들어온 곡">
				NEW
			</Badge>
		);
	}
	if (change === 0) {
		return (
			<span className="text-2xs font-bold text-muted-foreground" title="순위 변동 없음">
				–
			</span>
		);
	}
	const up = change > 0;
	return (
		<span
			className={`text-2xs font-black tabular-nums ${up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
			title={`직전 기간보다 ${Math.abs(change)}계단 ${up ? "상승" : "하락"}`}
		>
			{up ? "▲" : "▼"}
			{Math.abs(change)}
		</span>
	);
}

export const TrackItem = memo(function TrackItem({
	entry,
	playsLabel,
	favorite,
	onToggleFavorite,
}: {
	entry: ChartEntry;
	playsLabel: string;
	favorite: boolean;
	onToggleFavorite: (trackId: string) => Promise<void>;
}) {
	const [imgError, setImgError] = useState(false);
	const { rank } = entry;
	const isTopThree = rank <= 3;
	const sources = entry.sources.map((s) => SOURCE_LABELS[s] ?? s);

	return (
		<div className="bg-surface-2 rounded-card group relative flex items-center gap-2.5 sm:gap-4 p-3 sm:p-4 transition-colors duration-fast">
			{/* Desktop Rank Indicator */}
			<div className="hidden sm:flex w-10 flex-col items-center justify-center gap-0.5 shrink-0">
				{isTopThree ? (
					<Crown className={`h-6 w-6 ${rank === 1 ? "text-rank-1" : rank === 2 ? "text-rank-2" : "text-rank-3"}`} />
				) : (
					<span className="text-base font-bold text-muted-foreground">{rank}</span>
				)}
				<RankChange change={entry.rankChange} />
			</div>

			<div className="relative h-12 w-12 sm:h-16 sm:w-16 shrink-0 overflow-hidden rounded-card bg-muted/20">
				{/* Mobile Rank Overlay */}
				<div className="absolute top-0 left-0 z-10 sm:hidden flex items-center justify-center min-w-5 h-5 bg-surface-3 rounded-br-lg px-1.5 shadow-sm">
					{isTopThree ? (
						<Crown className={`h-3 w-3 ${rank === 1 ? "text-rank-1" : rank === 2 ? "text-rank-2" : "text-rank-3"}`} />
					) : (
						<span className="text-xs font-black tracking-tighter text-foreground">{rank}</span>
					)}
				</div>

				{entry.thumbnail && !imgError ? (
					<Image
						src={entry.thumbnail}
						alt=""
						aria-hidden
						fill
						sizes="64px"
						unoptimized
						className="object-cover"
						onError={() => setImgError(true)}
					/>
				) : (
					<MockThumbnail className="h-full w-full" />
				)}
			</div>

			<div className="min-w-0 flex-1">
				<h3 className="truncate text-base sm:text-lg font-black text-foreground leading-tight" title={entry.title}>
					{/^https?:\/\//i.test(entry.url ?? "") ? (
						<a
							href={entry.url!}
							target="_blank"
							rel="noopener noreferrer"
							className="hover:text-primary-text hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm transition-colors duration-fast"
						>
							{entry.title}
						</a>
					) : (
						entry.title
					)}
				</h3>
				<p className="mt-0.5 truncate text-sm sm:text-base font-bold text-muted-foreground" title={entry.artist}>
					{entry.artist}
				</p>
				<p className="mt-1 truncate text-xs sm:text-sm font-medium text-muted-foreground">
					<span className="sm:hidden">
						<RankChange change={entry.rankChange} />{" "}
					</span>
					{formatTimeToKorean(entry.duration / 1000)}
					{sources.length > 0 && <span title="재생된 소스"> · {sources.join(" · ")}</span>}
					<span className="sm:hidden"> · <span className="font-bold text-primary-text tabular-nums">{entry.plays.toLocaleString()}</span>회</span>
				</p>
			</div>

			<div className="flex items-center gap-1.5 sm:gap-4 pr-0.5 sm:pr-2 shrink-0">
				<div className="hidden sm:block text-right">
					<p className="text-base sm:text-lg font-black text-primary-text leading-none tabular-nums">{entry.plays.toLocaleString()}</p>
					<p className="hidden sm:block mt-1 text-xs text-muted-foreground font-bold">{playsLabel}</p>
				</div>

				{entry.trackId && (
					<FavoriteButton trackId={entry.trackId} favorite={favorite} onToggle={onToggleFavorite} />
				)}

				<TrackListenLink url={entry.url} title={entry.title} compact />
			</div>
		</div>
	);
});

export function Track({ track }: { track: TrackType }) {
	const [imgError, setImgError] = useState(false);

	return (
		<div className="bg-surface-1 rounded-card flex items-center gap-3 p-3 transition-colors duration-fast">
			<div className="relative h-14 w-14 overflow-hidden rounded-card">
				{track.thumbnail && !imgError ? (
					<Image
						src={track.thumbnail}
						alt=""
						aria-hidden
						fill
						sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
						unoptimized
						className="object-cover"
						onError={() => setImgError(true)}
					/>
				) : (
					<MockThumbnail className="h-full w-full" />
				)}
			</div>
			<div className="min-w-0 flex-1">
				<h3 className="truncate text-base font-semibold text-foreground" title={track.title}>
					{/^https?:\/\//i.test(track.url ?? "") ? (
						<a
							href={track.url!}
							target="_blank"
							rel="noopener noreferrer"
							className="hover:text-primary-text hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm transition-colors duration-fast"
						>
							{track.title}
						</a>
					) : (
						track.title
					)}
				</h3>
				<p className="truncate text-sm font-normal text-muted-foreground" title={track.artist}>
					{track.artist}
				</p>
				<p className="text-sm font-medium text-primary-text">{track.totalPlays.toLocaleString()}회 재생</p>
			</div>
		</div>
	);
}
