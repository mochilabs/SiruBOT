"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { formatDuration } from "@sirubot/utils/time";
import { ArrowLeft, Clock, History, Music2, Play, Trophy } from "lucide-react";

import { EmptyState } from "@/components/primitives/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SkeletonLine } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatRelativeTimeFromISO as formatRelativeTime } from "@/lib/format";
import { createApiFetcher, useGuildResource } from "@/lib/swr";
import { cn } from "@/lib/utils";

export interface PlayerTrack {
	id: string;
	title: string;
	artist: string;
	duration: number;
	thumbnail: string | null;
	url: string;
	source: string;
	totalPlays: number;
}

interface RecentEntry extends PlayerTrack {
	playedAt: string;
	requestedById: string | null;
}

interface TopEntry extends PlayerTrack {
	playCount: number;
}

interface PlayerStats {
	recent: RecentEntry[];
	top: TopEntry[];
	totalPlays: number;
}

const playerStatsFetcher = createApiFetcher<PlayerStats>("재생 기록을 불러오지 못했어요.");

function SectionHeading({ icon, title }: { icon: React.ReactNode; title: string }) {
	return (
		<h2 className="flex items-center gap-2 text-base font-extrabold tracking-tight text-foreground">
			<span className="text-primary-text">{icon}</span>
			{title}
		</h2>
	);
}

function TrackRow({
	index,
	track,
	meta,
	onPlay,
	playingUrl = null,
}: {
	index: number;
	track: PlayerTrack;
	meta: React.ReactNode;
	onPlay?: (track: PlayerTrack) => void;
	playingUrl?: string | null;
}) {
	const safeUrl = /^https?:\/\//i.test(track.url) ? track.url : null;
	return (
		<div className="group/row flex min-w-0 items-center gap-3 rounded-card bg-surface-2 px-3 py-2.5">
			<span className="w-4 shrink-0 text-xs font-bold tabular-nums text-muted-foreground">{index + 1}</span>
			{track.thumbnail ? (
				<div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-control">
					<Image src={track.thumbnail} alt="" fill className="object-cover" sizes="40px" unoptimized />
				</div>
			) : (
				<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-surface-1 text-muted-foreground">
					<Music2 size={14} aria-hidden />
				</div>
			)}
			<div className="min-w-0 flex-1">
				{safeUrl ? (
					<a
						href={safeUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="line-clamp-1 rounded-sm text-sm font-semibold text-foreground hover:text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors duration-fast"
					>
						{track.title}
					</a>
				) : (
					<p className="line-clamp-1 text-sm font-semibold text-foreground">{track.title}</p>
				)}
				<p className="truncate text-xs text-muted-foreground">{track.artist}</p>
			</div>
			<div className="shrink-0 text-xs tabular-nums text-muted-foreground">{meta}</div>
			{onPlay && (
				<Button
					variant="icon"
					size="icon-sm"
					className={cn(
						"transition-opacity duration-fast pointer-fine:opacity-0 pointer-fine:group-hover/row:opacity-100 focus-visible:opacity-100",
						playingUrl === track.url && "pointer-fine:opacity-100",
					)}
					icon={<Play size={13} aria-hidden />}
					onClick={() => onPlay(track)}
					loading={playingUrl === track.url}
					disabled={playingUrl !== null}
					aria-label={`${track.title} 다시 재생`}
				/>
			)}
		</div>
	);
}

function StatsSkeleton() {
	return (
		<div className="space-y-8" aria-busy="true">
			<Card padding="lg" className="gap-4">
				<SkeletonLine width="30%" height="h-5" />
				<div className="space-y-2">
					{[0, 1, 2, 3, 4].map((row) => (
						<SkeletonLine key={row} height="h-14" />
					))}
				</div>
			</Card>
		</div>
	);
}

export function PlayerClient({
	guildId,
	onPlay,
	playingUrl = null,
}: {
	guildId: string;
	onPlay?: (track: PlayerTrack) => void;
	playingUrl?: string | null;
}) {
	const [tab, setTab] = useState<"top" | "recent">("top");
	const { data, error, isLoading, mutate } = useGuildResource<PlayerStats>(guildId, "/player", { fetcher: playerStatsFetcher });

	const handleRetry = useCallback(() => {
		mutate();
	}, [mutate]);

	if (error) {
		return (
			<div className="py-8">
				<EmptyState
					icon={History}
					title="재생 기록을 불러오지 못했어요."
					description="잠시 후 다시 시도해 주세요."
					action={
						<Button variant="secondary" onClick={handleRetry}>
							다시 시도
						</Button>
					}
				/>
			</div>
		);
	}

	if (isLoading) return <StatsSkeleton />;

	const top = data?.top ?? [];
	const recent = data?.recent ?? [];

	if (top.length === 0 && recent.length === 0) {
		return (
			<div className="py-8">
				<EmptyState
					icon={Music2}
					title="아직 재생 기록이 없어요."
					description="위에서 곡을 검색해 재생하거나 Discord에서 /재생을 사용하면 기록이 쌓여요."
				/>
				<p className="mt-6">
					<Link
						href={`/servers/${guildId}`}
						className={cn(buttonVariants({ variant: "secondary" }), "gap-2")}
					>
						<ArrowLeft size={15} aria-hidden />
						서버 설정으로 돌아가기
					</Link>
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-8">
			<Card padding="lg" className="gap-4 p-4 sm:gap-5 sm:p-6">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<Tabs value={tab} onValueChange={(key) => setTab(key as "top" | "recent")} aria-label="재생 기록 뷰">
						<TabsList>
							<TabsTrigger value="top">많이 듣는 곡</TabsTrigger>
							<TabsTrigger value="recent">최근 재생</TabsTrigger>
						</TabsList>
					</Tabs>
					<SectionHeading icon={tab === "top" ? <Trophy size={15} /> : <History size={15} />} title={tab === "top" ? "서버 인기 트랙" : "최근에 재생한 곡"} />
				</div>

				{tab === "top" ? (
					top.length > 0 ? (
						<div className="space-y-2">
							{top.map((track, index) => (
								<TrackRow
									key={track.id}
									index={index}
									track={track}
									meta={`${track.playCount.toLocaleString()}회${track.duration > 0 ? ` · ${formatDuration(track.duration)}` : ""}`}
									onPlay={onPlay}
									playingUrl={playingUrl}
								/>
							))}
						</div>
					) : (
						<EmptyState icon={Trophy} title="아직 인기 트랙이 없어요." size="sm" />
					)
				) : recent.length > 0 ? (
					<div className="space-y-2">
						{recent.map((track, index) => (
							<TrackRow
								key={`${track.id}-${track.playedAt}`}
								index={index}
								track={track}
								meta={
									<span className="flex items-center gap-1.5">
										<Clock size={12} aria-hidden />
										{formatRelativeTime(track.playedAt)}
									</span>
								}
								onPlay={onPlay}
									playingUrl={playingUrl}
							/>
						))}
					</div>
				) : (
					<EmptyState icon={History} title="최근 재생 기록이 없어요." size="sm" />
				)}
			</Card>
		</div>
	);
}