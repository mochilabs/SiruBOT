"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { AnimatePresence, m } from "framer-motion";
import { ListMusic, Music2, Sparkles, Volume2 } from "lucide-react";

import { Card } from "@/components/primitives/card";

const BOT_AVATAR = "/images/profile.png";

export interface TrackInfo {
	title: string;
	artist: string;
	duration: number;
	thumbnail: string;
}

export interface SlideConfig {
	command: string;
	args: string;
}

export const slideConfigs: SlideConfig[] = [
	{ command: "/재생", args: "Justice" },
	{ command: "/추천", args: "" },
	{ command: "/플레이리스트", args: "재생 내 노래모음" },
	{ command: "/현재곡", args: "" },
];

const TRACKS: TrackInfo[] = [
	{
		title: 'I wish I had been midnight. "Justice" MV',
		artist: "ずっと真夜中でいいのに。",
		duration: 280,
		thumbnail: "https://i.ytimg.com/vi/7kUbX4DoZoc/hqdefault.jpg",
	},
	{
		title: "Gurenge",
		artist: "LiSA",
		duration: 238,
		thumbnail: "https://i.ytimg.com/vi/MpYy6wwqxoo/hqdefault.jpg",
	},
	{
		title: "아이돌 (Idol)",
		artist: "YOASOBI",
		duration: 213,
		thumbnail: "https://i.ytimg.com/vi/ZRtdQ81jPUQ/hqdefault.jpg",
	},
	{
		title: "Night Dancer",
		artist: "imase",
		duration: 210,
		thumbnail: "https://i.ytimg.com/vi/kagoEGKHZvU/hqdefault.jpg",
	},
];

const COMMAND_MENTION = "bg-discord-primary/20 px-1 rounded-sm text-discord-light";

const formatDuration = (seconds: number) => {
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
};

function TrackThumbnail({ track, size }: { track: TrackInfo; size: string }) {
	return (
		<div className={`relative shrink-0 overflow-hidden rounded-md border border-discord-btn-active ${size}`}>
			<Image src={track.thumbnail} alt="" fill className="object-cover" sizes="80px" unoptimized />
		</div>
	);
}

function MusicResult() {
	const track = TRACKS[0];

	return (
		<div className="space-y-2.5 rounded-md border-l-4 border-discord-primary bg-discord-embed p-3">
			<div className="flex items-center gap-1.5 text-2xs font-semibold text-discord-text-muted">
				<Music2 size={13} aria-hidden />
				지금 재생 중인 곡
			</div>
			<div className="flex gap-3">
				<div className="min-w-0 flex-1 space-y-1.5">
					<p className="line-clamp-2 text-sm font-bold leading-snug text-discord-text">{track.title}</p>
					<p className="truncate text-xs text-discord-text-muted">{track.artist}</p>
					<div className="flex items-center gap-2 text-2xs tabular-nums text-discord-text-muted">
						<span>0:43</span>
						<div className="h-1 flex-1 overflow-hidden rounded-full bg-discord-btn-active">
							<m.div
								className="h-full rounded-full bg-discord-primary"
								initial={{ width: "0%" }}
								animate={{ width: "25%" }}
								transition={{ duration: 2, ease: "linear" }}
							/>
						</div>
						<span>{formatDuration(track.duration)}</span>
					</div>
				</div>
				<TrackThumbnail track={track} size="h-14 w-14" />
			</div>
			<div className="flex items-center gap-3 border-t border-discord-btn-active pt-2.5" aria-hidden>
				<div className="flex h-4 items-end gap-[3px]">
					{[0.9, 0.55, 0.75, 0.4].map((height, bar) => (
						<m.span
							key={bar}
							className="w-[3px] rounded-full bg-discord-primary"
							animate={{ height: [`${height * 30}%`, "100%", `${height * 30}%`] }}
							transition={{ duration: 1, repeat: Infinity, delay: bar * 0.15, ease: "easeInOut" }}
						/>
					))}
				</div>
				<span className="text-2xs font-semibold text-discord-light">음악 채널에서 재생 중</span>
			</div>
		</div>
	);
}

function RecommendResult() {
	const track = TRACKS[1];

	return (
		<div className="space-y-2.5 rounded-md border-l-4 border-discord-primary bg-discord-embed p-3">
			<div className="flex items-center gap-2 text-sm font-bold text-discord-text">
				<Sparkles size={16} className="text-discord-light" aria-hidden />
				시루봇이 골라서 이어 재생할게요
			</div>
			<div className="flex items-center gap-3">
				<TrackThumbnail track={track} size="h-11 w-11" />
				<div className="min-w-0">
					<p className="truncate text-sm font-semibold text-discord-text">{track.title}</p>
					<p className="truncate text-xs text-discord-text-muted">{track.artist}</p>
				</div>
			</div>
		</div>
	);
}

function PlaylistResult() {
	const playlistTracks = TRACKS.slice(0, 3);
	const duration = playlistTracks.reduce((total, track) => total + track.duration, 0);

	return (
		<div className="space-y-2.5 rounded-md border-l-4 border-discord-primary bg-discord-embed p-3">
			<div className="flex items-center gap-2 text-sm font-bold text-discord-text">
				<ListMusic size={16} className="text-discord-light" aria-hidden />
				내 노래모음
			</div>
			<div className="space-y-2">
				{playlistTracks.map((track, index) => (
					<div key={track.title} className="flex min-w-0 items-center gap-2 text-xs text-discord-text">
						<span className="w-3 shrink-0 tabular-nums text-discord-text-muted">{index + 1}</span>
						<span className="truncate font-medium">{track.title}</span>
						<span className="shrink-0 tabular-nums text-discord-text-muted">{formatDuration(track.duration)}</span>
					</div>
				))}
			</div>
			<p className="border-t border-discord-btn-active pt-2 text-2xs text-discord-text-muted">3곡 · 총 {formatDuration(duration)}</p>
		</div>
	);
}

function NowPlayingResult() {
	const track = TRACKS[0];

	return (
		<div className="space-y-2.5 rounded-md border-l-4 border-discord-primary bg-discord-embed p-3">
			<div className="flex items-center gap-3">
				<TrackThumbnail track={track} size="h-11 w-11" />
				<div className="min-w-0 flex-1">
					<p className="line-clamp-2 text-sm font-bold leading-snug text-discord-text">{track.title}</p>
					<p className="truncate text-xs text-discord-text-muted">
						{track.artist} · 신청자: <span className={COMMAND_MENTION}>@사용자</span>
					</p>
				</div>
			</div>
			<div className="flex items-center justify-between border-t border-discord-btn-active pt-2 text-2xs font-semibold text-discord-text-muted">
				<span className="bg-discord-primary/10 rounded-sm px-1.5 py-0.5 text-discord-light">일시정지</span>
				<span>대기열 3곡 · 볼륨 100%</span>
			</div>
		</div>
	);
}

function commandResult(slide: SlideConfig): ReactNode {
	switch (slide.command) {
		case "/추천":
			return <RecommendResult />;
		case "/플레이리스트":
			return <PlaylistResult />;
		case "/현재곡":
			return <NowPlayingResult />;
		default:
			return <MusicResult />;
	}
}

export function DiscordCommandAnimation({ activeSlide = 0 }: { activeSlide?: number }) {
	const safeIndex = Math.min(Math.max(activeSlide, 0), slideConfigs.length - 1);
	const currentSlide = slideConfigs[safeIndex];

	return (
		<Card variant="raised" padding="none" className="gap-0 overflow-hidden bg-discord-bg font-sans">
			<div className="flex items-center gap-2 border-b border-discord-btn-active px-4 py-3">
				<Volume2 size={15} className="text-discord-text-muted" aria-hidden />
				<span className="text-sm font-semibold text-discord-text">음악-라운지</span>
			</div>
			<div className="min-h-[340px] p-4 sm:p-5" aria-live="polite">
				<AnimatePresence mode="wait" initial={false}>
					<m.div
						key={`${currentSlide.command}-${currentSlide.args}`}
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.18, ease: "easeOut" }}
						className="space-y-4"
					>
						<m.div
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.3, ease: "easeOut", delay: 0.05 }}
							className="flex gap-3"
						>
							<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-discord-btn-active text-xs font-bold text-discord-text">
								사
							</div>
							<div className="min-w-0">
								<div className="flex items-baseline gap-2">
									<span className="text-sm font-semibold text-discord-text">사용자</span>
									<span className="text-2xs text-discord-text-muted">오후 8:12</span>
								</div>
								<p className="mt-1 text-sm text-discord-text">
								<span className={COMMAND_MENTION}>{currentSlide.command}</span>
								{currentSlide.args && <span> {currentSlide.args}</span>}
							</p>
							</div>
						</m.div>
						<m.div
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.3, ease: "easeOut", delay: 0.2 }}
							className="flex gap-3"
						>
							<div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-discord-btn-active">
								<Image src={BOT_AVATAR} alt="시루" fill className="object-cover" sizes="36px" />
							</div>
							<div className="min-w-0 flex-1">
								<div className="mb-2 flex items-center gap-2">
									<span className="text-sm font-semibold text-discord-text">시루</span>
									<span className="rounded-sm bg-discord-primary px-1 py-0.5 text-2xs font-bold leading-none text-primary-foreground">앱</span>
									<span className="text-2xs text-discord-text-muted">오후 8:12</span>
								</div>
								{commandResult(currentSlide)}
							</div>
						</m.div>
					</m.div>
				</AnimatePresence>
			</div>
			<p className="border-t border-discord-btn-active px-4 py-2.5 text-2xs text-discord-text-muted">
				채널에 명령어를 입력하면 시루봇이 바로 응답해요.
			</p>
		</Card>
	);
}