"use client";

import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";
import Image from "next/image";
import type { Track as TrackType } from "@sirubot/prisma";
import { formatTimeToKorean } from "@sirubot/utils/time";
import { Crown, Heart } from "lucide-react";
import useSWR from "swr";

import { MockThumbnail } from "@/components/primitives/mock-thumbnail";
import { TrackListenLink } from "@/components/track-listen-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton, SkeletonLine } from "@/components/ui/skeleton";
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

/** 차트 로딩 자리 — TrackItem과 같은 크기의 행을 보여줘서 데이터가 들어와도 레이아웃이 튀지 않아요. */
export function TrackListSkeleton({ rows = 8 }: { rows?: number }) {
	return (
		<div role="status" aria-label="차트를 불러오는 중" className="w-full space-y-2">
			{Array.from({ length: rows }, (_, i) => (
				<div key={i} className="bg-surface-2 rounded-card flex items-center gap-2.5 sm:gap-4 p-3 sm:p-4">
					<div className="hidden sm:flex w-10 justify-center shrink-0">
						<SkeletonLine width="1.25rem" height="h-5" className="bg-border" />
					</div>
					<Skeleton className="h-12 w-12 sm:h-16 sm:w-16 shrink-0 rounded-card bg-border" />
					<div className="min-w-0 flex-1 space-y-2">
						<SkeletonLine width="45%" height="h-4 sm:h-5" className="bg-border" />
						<SkeletonLine width="30%" height="h-3 sm:h-4" className="bg-border" />
						<SkeletonLine width="25%" height="h-3" className="bg-border sm:hidden" />
					</div>
					<div className="flex items-center gap-1.5 sm:gap-4 pr-0.5 sm:pr-2 shrink-0">
						<SkeletonLine width="4rem" height="h-4" className="hidden bg-border sm:block" />
						<SkeletonLine width="2.5rem" height="h-6" className="hidden bg-border sm:block" />
						<Skeleton className="h-8 w-8 sm:h-10 sm:w-10 rounded-control bg-border" />
						<Skeleton className="h-8 w-8 sm:w-14 rounded-control bg-border" />
					</div>
				</div>
			))}
			<span className="sr-only">차트를 불러오는 중이에요.</span>
		</div>
	);
}

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
			className="motion-reduce:!transition-none motion-reduce:!transform-none"
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
	// 무한 스크롤로 key가 바뀌어도 이전 하트 상태를 유지해 깜빡임/오토글을 막아요
	const { data, mutate } = useSWR<{ trackIds: string[] }>(key, { keepPreviousData: true });

	const favoriteIds = useMemo(() => new Set(data?.trackIds ?? []), [data]);
	// toggle이 클로저의 오래된 data에 의존하지 않도록 최신 집합을 ref로 들고 있어요
	const favoriteRef = useRef(favoriteIds);
	favoriteRef.current = favoriteIds;

	const toggle = useCallback(
		async (trackId: string) => {
			const wasFavorite = favoriteRef.current.has(trackId);
			// 낙관적 업데이트 — 성공 여부와 무관하게 마지막에 재검증 (함수형 갱신으로 연속 클릭도 서로 지우지 않아요)
			const next = new Set(favoriteRef.current);
			next[wasFavorite ? "delete" : "add"](trackId);
			favoriteRef.current = next;
			await mutate(
				(cur) => {
					const set = new Set(cur?.trackIds ?? []);
					set[wasFavorite ? "delete" : "add"](trackId);
					return { trackIds: [...set] };
				},
				{ revalidate: false },
			);
			try {
				const res = await fetch(
					wasFavorite ? `/api/favorites?trackId=${encodeURIComponent(trackId)}` : "/api/favorites",
					wasFavorite
						? { method: "DELETE" }
						: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trackId }) },
				);
				const json = (await res.json().catch(() => ({}))) as { error?: string; alreadyRemoved?: boolean };
				if (res.status === 401) throw new Error("로그인하면 즐겨찾기를 쓸 수 있어요.");
				if (!res.ok && res.status !== 409 && !(res.status === 404 && json.alreadyRemoved)) {
					throw new Error(json.error || "요청을 처리하지 못했어요.");
				}
			} finally {
				await mutate();
			}
		},
		[mutate],
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
		<Button
			variant="state-toggle"
			size="icon-sm"
			active={favorite}
			aria-pressed={favorite}
			onClick={handleClick}
			disabled={pending}
			title={favorite ? "즐겨찾기 제거" : "즐겨찾기에 추가"}
			className="sm:h-10 sm:w-10"
		>
			<Heart className="h-4 w-4 sm:h-5 sm:w-5" fill={favorite ? "currentColor" : "none"} aria-hidden />
			<span className="sr-only">{favorite ? "즐겨찾기 제거" : "즐겨찾기에 추가"}</span>
		</Button>
	);
}

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
			className={`text-2xs font-extrabold tabular-nums ${up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
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
				<div className="absolute top-0 left-0 z-10 sm:hidden flex items-center justify-center min-w-5 h-5 bg-surface-3 rounded-br-control px-1.5 shadow-sm">
					{isTopThree ? (
						<Crown className={`h-3 w-3 ${rank === 1 ? "text-rank-1" : rank === 2 ? "text-rank-2" : "text-rank-3"}`} />
					) : (
						<span className="text-xs font-extrabold tracking-tighter text-foreground">{rank}</span>
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
				<h2 className="truncate text-base sm:text-lg font-extrabold text-foreground leading-tight" title={entry.title}>
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
				</h2>
				<p className="mt-0.5 truncate text-sm sm:text-base font-bold text-muted-foreground" title={entry.artist}>
					{entry.artist}
				</p>
				{/* 모바일 전용 줄 — 데스크톱은 길이·재생 수를 오른쪽 열에 보여줘요 */}
				<p className="mt-1 truncate text-xs font-medium text-muted-foreground sm:hidden">
					<RankChange change={entry.rankChange} /> {formatTimeToKorean(entry.duration / 1000)} ·{" "}
					<span className="font-bold text-primary-text tabular-nums">{entry.plays.toLocaleString()}</span>회
				</p>
			</div>

			<div className="flex items-center gap-1.5 sm:gap-4 pr-0.5 sm:pr-2 shrink-0">
				<p className="hidden sm:block w-20 text-right text-sm font-medium text-muted-foreground tabular-nums">
					{formatTimeToKorean(entry.duration / 1000)}
				</p>
				<div className="hidden sm:block text-right">
					<p className="text-base sm:text-lg font-extrabold text-primary-text leading-none tabular-nums">{entry.plays.toLocaleString()}</p>
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
