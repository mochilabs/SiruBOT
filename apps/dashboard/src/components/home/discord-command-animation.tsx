"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { AnimatePresence, m } from "framer-motion";
import { Volume2 } from "lucide-react";

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

/** 썸네일이 항상 우측에 붙는 Section 래퍼 — 실제 봇의 SectionBuilder + setThumbnailAccessory와 동일한 구조 */
function Section({ children, thumbnail }: { children: ReactNode; thumbnail?: string }) {
	return (
		<div className="flex items-start gap-3">
			<div className="min-w-0 flex-1 space-y-1">{children}</div>
			{thumbnail ? (
				<div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-discord-btn-active">
					<Image src={thumbnail} alt="" fill className="object-cover" sizes="56px" unoptimized />
				</div>
			) : null}
		</div>
	);
}

/** 실제 봇의 `-#` subtext 라인에 해당 (TextDisplayBuilder 의 작은 회색 텍스트) */
function Subtext({ children }: { children: ReactNode }) {
	return <p className="text-2xs leading-snug text-discord-text-muted">{children}</p>;
}

/** 실제 봇의 `###` 헤딩 라인 */
function Heading({ children }: { children: ReactNode }) {
	return <p className="text-sm font-bold leading-snug text-discord-text">{children}</p>;
}

/** 실제 봇 푸터: `-# 📡 재생 서버: main | 🔊 볼륨: 100% | 시루 x.x.x` */
function Footer({ left, right }: { left: string; right?: string }) {
	return (
		<div className="mt-2 flex items-center justify-between border-t border-discord-btn-active pt-2 text-2xs text-discord-text-muted">
			<span>{left}</span>
			{right ? <span>{right}</span> : null}
		</div>
	);
}

/** /재생 — trackAdded (play.ts): "🎵 대기열 N번에 추가" + ### 제목(링크) + -# 아티스트·신청자·대기열 남은 시간 */
function PlayResult() {
	const track = TRACKS[0];

	return (
		<div className="space-y-1.5 rounded-md border-l-4 border-discord-primary bg-discord-embed p-3">
			<p className="text-2xs leading-snug text-discord-text">🎵 노래를 대기열 4번에 추가했어요.</p>
			<Section thumbnail={track.thumbnail}>
				<Heading>
					<span className="underline decoration-discord-text/20 underline-offset-2">{track.title}</span>
					<span className="ml-1.5 align-middle text-2xs font-medium tabular-nums text-discord-text-muted">({formatDuration(track.duration)})</span>
				</Heading>
				<Subtext>
					아티스트: {track.artist} | 신청자: <span className={COMMAND_MENTION}>@사용자</span> | 3곡 남음 (12:36)
				</Subtext>
			</Section>
		</div>
	);
}

/** /추천 — recommend.ts: "✨ 추천곡 N곡을 대기열에 추가했어요." + 번호 리스트. 썸네일 없는 순수 텍스트 컨테이너 */
function RecommendResult() {
	return (
		<div className="space-y-1.5 rounded-md border-l-4 border-discord-primary bg-discord-embed p-3">
			<p className="text-sm leading-snug text-discord-text">✨ 추천곡 <strong>3곡</strong>을 대기열에 추가했어요.</p>
			<ol className="space-y-0.5 text-sm text-discord-text">
				{TRACKS.slice(1, 4).map((track, index) => (
					<li key={track.title} className="truncate">
						{index + 1}. <strong className="font-semibold">{track.title}</strong>
					</li>
				))}
			</ol>
		</div>
	);
}

/** /플레이리스트 재생 — playlistQueued (play.ts): "📝 N곡이 추가되었어요." + 부제 + separator + 미리보기 리스트 + 썸네일 우측 */
function PlaylistResult() {
	const preview = TRACKS.slice(0, 3);
	const total = preview.reduce((acc, track) => acc + track.duration, 0);

	return (
		<div className="space-y-1.5 rounded-md border-l-4 border-discord-primary bg-discord-embed p-3">
			<Section thumbnail={preview[0].thumbnail}>
				<Heading>📝 재생목록의 노래 3곡이 추가되었어요.</Heading>
				<Subtext>
					<strong className="font-semibold text-discord-text">내 노래모음</strong> ({formatDuration(total)})
				</Subtext>
				<div className="mt-1.5 space-y-0.5 border-t border-discord-btn-active/60 pt-1.5">
					<Subtext>🎵 추가된 곡 미리보기</Subtext>
					{preview.map((track, index) => (
						<p key={track.title} className="truncate text-xs leading-snug text-discord-text">
							<span className="mr-1 rounded-sm bg-discord-btn-active px-1 text-2xs tabular-nums text-discord-text-muted">#{index + 1}</span>
							<span className="font-medium">{track.title}</span>
							<span className="ml-1 text-2xs tabular-nums text-discord-text-muted">({formatDuration(track.duration)})</span>
						</p>
					))}
				</div>
			</Section>
		</div>
	);
}

/** /현재곡 — nowplaying.ts: "-# 🎵 <#채널> 에서 재생 중" + ### 제목(링크) + 아티스트/신청자/길이 + footer */
function NowPlayingResult() {
	const track = TRACKS[0];

	return (
		<div className="space-y-1.5 rounded-md border-l-4 border-discord-primary bg-discord-embed p-3">
			<Subtext>🎵 #음악-라운지 에서 재생 중</Subtext>
			<Section thumbnail={track.thumbnail}>
				<Heading>
					<span className="underline decoration-discord-text/20 underline-offset-2">{track.title}</span>
				</Heading>
				<Subtext>아티스트: {track.artist}</Subtext>
				<Subtext>
					신청자: <span className={COMMAND_MENTION}>@사용자</span>
				</Subtext>
				<Subtext>(0:43 / {formatDuration(track.duration)})</Subtext>
			</Section>
			<Footer left="📡 재생 서버: main | 🔊 볼륨: 100%" />
		</div>
	);
}

function commandResult(slide: SlideConfig): ReactNode {
	switch (slide.command) {
		case "/재생":
			return <PlayResult />;
		case "/추천":
			return <RecommendResult />;
		case "/플레이리스트":
			return <PlaylistResult />;
		case "/현재곡":
			return <NowPlayingResult />;
		default:
			return <NowPlayingResult />;
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
