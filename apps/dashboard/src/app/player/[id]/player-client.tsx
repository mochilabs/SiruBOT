"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Clock, History, Music2, Trophy } from "lucide-react";
import useSWR from "swr";

import { Card } from "@/components/primitives/card";
import { EmptyState } from "@/components/primitives/empty-state";
import { SkeletonLine } from "@/components/primitives/skeleton";

interface PlayerTrack {
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

const formatDuration = (ms: number) => {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const remaining = seconds % 60;
	return `${minutes}:${remaining.toString().padStart(2, "0")}`;
};

const formatRelativeTime = (iso: string) => {
	const diffMs = Date.now() - new Date(iso).getTime();
	const minutes = Math.floor(diffMs / 60000);
	if (minutes < 1) return "방금";
	if (minutes < 60) return `${minutes}분 전`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}시간 전`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}일 전`;
	return new Date(iso).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
};

function SectionHeading({ icon, title }: { icon: React.ReactNode; title: string }) {
	return (
		<h2 className="flex items-center gap-2 text-base font-black tracking-tight text-foreground">
			<span className="text-primary">{icon}</span>
			{title}
		</h2>
	);
}

function TrackRow({ index, track, meta }: { index: number; track: PlayerTrack; meta: React.ReactNode }) {
	return (
		<div className="flex min-w-0 items-center gap-3 rounded-control bg-surface-2 px-3 py-2.5">
			<span className="w-4 shrink-0 text-xs font-bold tabular-nums text-muted-foreground">{index + 1}</span>
			{track.thumbnail ? (
				<div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-border-subtle">
					<Image src={track.thumbnail} alt="" fill className="object-cover" sizes="40px" unoptimized />
				</div>
			) : (
				<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border-subtle bg-surface-3 text-muted-foreground">
					<Music2 size={14} aria-hidden />
				</div>
			)}
			<div className="min-w-0 flex-1">
				<a
					href={track.url}
					target="_blank"
					rel="noopener noreferrer"
					className="line-clamp-1 text-sm font-semibold text-foreground hover:text-primary transition-colors duration-fast"
				>
					{track.title}
				</a>
				<p className="truncate text-xs text-muted-foreground/80">{track.artist}</p>
			</div>
			<div className="shrink-0 text-xs tabular-nums text-muted-foreground">{meta}</div>
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

export function PlayerClient({ guildId }: { guildId: string }) {
	const [tab, setTab] = useState<"top" | "recent">("top");
	const { data, error, isLoading, mutate } = useSWR<PlayerStats>(`/api/servers/${guildId}/player`);

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
						<button
							type="button"
							onClick={handleRetry}
							className="inline-flex h-9 items-center rounded-control border border-border-strong bg-surface-2 px-4 text-sm font-medium text-foreground transition-colors duration-fast hover:bg-surface-3"
						>
							다시 시도
						</button>
					}
				/>
			</div>
		);
	}

	if (isLoading) return <StatsSkeleton />;

	const top = data?.top ?? [];
	const recent = data?.recent ?? [];
	const totalPlays = data?.totalPlays ?? 0;

	if (top.length === 0 && recent.length === 0) {
		return (
			<div className="py-8">
				<EmptyState
					icon={Music2}
					title="아직 재생 기록이 없어요."
					description="Discord 채널에서 /재생으로 곡을 틀면 기록이 쌓여요."
				/>
				<p className="mt-6">
					<Link
						href={`/servers/${guildId}`}
						className="inline-flex h-9 items-center gap-2 rounded-control border border-border-strong bg-surface-2 px-4 text-sm font-medium text-foreground transition-colors duration-fast hover:bg-surface-3"
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
			<div className="grid gap-4 sm:grid-cols-2">
				<Card padding="lg" className="gap-1">
					<p className="text-xs font-medium text-muted-foreground">누적 재생</p>
					<p className="text-2xl font-black tracking-tighter tabular-nums text-foreground">{totalPlays.toLocaleString()}회</p>
				</Card>
				<Card padding="lg" className="gap-1">
					<p className="text-xs font-medium text-muted-foreground">재생한 곡</p>
					<p className="text-2xl font-black tracking-tighter tabular-nums text-foreground">{top.length.toLocaleString()}종</p>
				</Card>
			</div>

			<Card padding="lg" className="gap-5">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="flex items-center gap-1 rounded-control border border-border bg-surface-2 p-1" role="tablist" aria-label="재생 기록 뷰">
						<button
							type="button"
							role="tab"
							aria-selected={tab === "top"}
							onClick={() => setTab("top")}
							className={`rounded-control px-3.5 py-1.5 text-sm font-bold transition-colors duration-fast ${
								tab === "top" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
							}`}
						>
							많이 듣는 곡
						</button>
						<button
							type="button"
							role="tab"
							aria-selected={tab === "recent"}
							onClick={() => setTab("recent")}
							className={`rounded-control px-3.5 py-1.5 text-sm font-bold transition-colors duration-fast ${
								tab === "recent" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
							}`}
						>
							최근 재생
						</button>
					</div>
					<SectionHeading icon={tab === "top" ? <Trophy size={15} /> : <History size={15} />} title={tab === "top" ? "서버 인기 트랙" : "최근에 재생한 곡"} />
				</div>

				{tab === "top" ? (
					top.length > 0 ? (
						<div className="space-y-2">
							{top.map((track, index) => (
								<TrackRow key={track.id} index={index} track={track} meta={`${track.playCount.toLocaleString()}회 · ${formatDuration(track.duration)}`} />
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