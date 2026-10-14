"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { Bot, Brain, Check, CloudSun, LayoutDashboard, ListMusic, Music2, Pause, Repeat, SkipForward } from "lucide-react";

import { SectionLabel } from "@/components/primitives/section-label";
import { StreamingTypeText } from "@/components/streaming-type-text";
import { TypingText } from "@/components/typing-text";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const secondaryLink =
	"inline-flex h-8 pointer-coarse:min-h-11 cursor-pointer select-none items-center justify-center gap-2 self-start rounded-control border border-border-strong bg-surface-2 px-3 text-sm font-medium text-foreground transition-colors duration-fast hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

const TRACKS = [
	{
		title: 'I wish I had been midnight. "Justice" MV',
		artist: "ずっと真夜中でいいのに。",
		thumbnail: "https://i.ytimg.com/vi/7kUbX4DoZoc/hqdefault.jpg",
		duration: "4:40",
	},
	{ title: "Gurenge", artist: "LiSA", thumbnail: "https://i.ytimg.com/vi/MpYy6wwqxoo/hqdefault.jpg", duration: "3:58" },
	{ title: "아이돌 (Idol)", artist: "YOASOBI", thumbnail: "https://i.ytimg.com/vi/ZRtdQ81jPUQ/hqdefault.jpg", duration: "3:33" },
	{ title: "Night Dancer", artist: "imase", thumbnail: "https://i.ytimg.com/vi/kagoEGKHZvU/hqdefault.jpg", duration: "3:30" },
	{ title: "Blinding Lights", artist: "The Weeknd", thumbnail: "https://i.ytimg.com/vi/4NRXx6U8ABQ/hqdefault.jpg", duration: "3:22" },
] as const;

const COMMAND_TOKEN = "rounded-sm bg-muted px-1.5 py-0.5 text-2xs font-bold text-muted-foreground";

const utilities = [
	{
		icon: Music2,
		title: "음악 재생",
		desc: "\"노래 틀어줘\" 한마디로 대기열에 추가해요.",
		prompt: "즛토마요 노래 틀어줘",
		status: "시루가 음악을 찾는 중..",
		reply: "즛토마요 노래를 대기열에 추가했어요. 지금 음성 채널에서 재생 중이에요.",
	},
	{
		icon: CloudSun,
		title: "생활 정보",
		desc: "/날씨 · /택배 · 오늘의 운세까지 챙겨드려요.",
		prompt: "내일 아침 비 와?",
		status: "시루가 날씨를 확인하는 중..",
		reply: "내일 서울은 이슬비 소식이 있고, 강수확률이 92%로 매우 높아요!",
	},
	{
		icon: Brain,
		title: "장기 기억",
		desc: "시루가 사용자님의 취향을 기억해요.",
		prompt: "난 햄버거가 좋아 기억해줘",
		status: "시루가 메모리를 업데이트 하는중",
		reply: "알겠어! 햄버거 좋아하는구나? 딱 기억해둘게! 🍔",
	},
];

const sectionVariants = {
	hidden: { opacity: 0, y: 24 },
	visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
} as const;

/**
 * 명령어 칩 스태거 variants — 탭 전환마다 칩들이 0.04초 간격으로 연쇄 등장.
 * reduced-motion에선 chipFadeVariants(opacity만)로 폴백해요.
 */
const chipVariants = {
	hidden: { opacity: 0, y: 6 },
	visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
} as const;

const chipFadeVariants = {
	hidden: { opacity: 0 },
	visible: { opacity: 1, transition: { duration: 0.3, ease: "easeOut" } },
} as const;

const chipsContainerVariants = {
	hidden: { opacity: 0 },
	visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
} as const;

const HEADING_TEXT = "채널에서 재생하고, 웹에서 관리해요.";

const settingRow = "flex min-w-0 items-center justify-between gap-3 rounded-control bg-surface-1 px-3 py-2";
const settingName = "truncate text-sm font-medium text-foreground";

/** 대시보드 설정 프리뷰 — 각 행이 "이전 값 → 새 값"으로 바뀌는 추상 설정 리스트. */
interface SettingToggle {
	label: string;
	rows: Array<{ name: string; from: string; to: string }>;
}

const dashboardSettingSlides: SettingToggle[] = [
	{
		label: "AI 채팅 설정",
		rows: [
			{ name: "응답 범위", from: "모든 채널", to: "#ai-라운지만" },
			{ name: "도구 사용", from: "끄기", to: "켜기" },
			{ name: "대화 기억", from: "끄기", to: "켜기" },
		],
	},
	{
		label: "음악 설정",
		rows: [
			{ name: "기본 볼륨", from: "80%", to: "100%" },
			{ name: "반복 모드", from: "반복 없음", to: "한 곡 반복" },
			{ name: "관련곡 추가", from: "끄기", to: "켜기" },
		],
	},
	{
		label: "채널·권한 설정",
		rows: [
			{ name: "음악 채널", from: "미지정", to: "#음악-라운지" },
			{ name: "DJ 역할", from: "없음", to: "DJ" },
			{ name: "검색 동작", from: "선택 재생", to: "즉시 재생" },
		],
	},
	{
		label: "임시 음성채널",
		rows: [
			{ name: "사용", from: "끄기", to: "켜기" },
			{ name: "생성 위치", from: "미지정", to: "게임 카테고리" },
			{ name: "인원 제한", from: "제한 없음", to: "5명" },
		],
	},
	{
		label: "오디오 필터",
		rows: [
			{ name: "프리셋", from: "표준", to: "베이스부스트" },
			{ name: "갭리스 재생", from: "끄기", to: "켜기" },
			{ name: "크로스페이드", from: "끄기", to: "4초" },
		],
	},
];

/** 설정 하나가 from → to 로 슥 바뀌는 행 */
function SettingToggleRow({ name, from, to, index }: { name: string; from: string; to: string; index: number }) {
	return (
		<div className={settingRow}>
			<span className={settingName}>{name}</span>
			<span className="relative shrink-0 text-xs font-semibold">
				{/* 새 값이 폭을 결정 — from은 위로 슝 사라짐 (등장 시엔 from 노출 없이 바로 from → to 전환) */}
				<m.span className="text-primary-text">
					{to}
				</m.span>
				<m.span
					className="absolute inset-0 text-right text-muted-foreground"
					initial={{ y: 0, opacity: 0 }}
					animate={{ y: -12, opacity: 0 }}
					transition={{ delay: 0.4 + index * 0.3, duration: 0.35, ease: "easeOut" }}
					style={{ opacity: 0 }}
				>
					{from}
				</m.span>
			</span>
		</div>
	);
}

/** 설정 카드 하나 — 행들이 순서대로 값이 바뀌고, 마치 스크롤해 설정을 바꾸는 느낌 */
function SettingScroller({ slide }: { slide: SettingToggle }) {
	return (
		<div className="space-y-2">
			{slide.rows.map((row, index) => (
				<SettingToggleRow key={`${slide.label}-${row.name}`} name={row.name} from={row.from} to={row.to} index={index} />
			))}
		</div>
	);
}

/** mm:ss 문자열 → 초 (프리뷰 진행도 계산용) */
const toSeconds = (stamp: string) => {
	const [minutes, seconds] = stamp.split(":");
	return Number(minutes) * 60 + Number(seconds);
};

/** 초 → mm:ss (한 자리 초는 0을 채워요) */
const fmtTime = (total: number) => `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;

/** 프리뷰에서 곡을 처음부터 틀면 진행도가 몇 %에서 멈춰요 — 곡 마무리 24초만 흘려 '끝나고 다음 곡' 흐름을 보여줘요 */
const PREVIEW_TAIL_SECONDS = 24;

/**
 * 음악 컨트롤러 프리뷰 — 실제 재생처럼 진행도가 흐르고 곡이 순환하는 embed.
 * 초 단위 시계가 진행 바·시간 배지를 밀고, 곡이 끝나면 건너뛰기 버튼이 반응한 뒤
 * 다음 곡 제목·썸네일로 크로스페이드해요. reduced-motion에선 시계를 멈춘 정지 화면을 보여줘요.
 */
function PlayerPreview() {
	const shouldReduce = useReducedMotion();
	const [trackIndex, setTrackIndex] = useState(0);
	const [seconds, setSeconds] = useState(() => Math.max(0, toSeconds(TRACKS[0].duration) - PREVIEW_TAIL_SECONDS));
	const track = TRACKS[trackIndex];
	const durationSeconds = toSeconds(track.duration);
	const advancing = seconds >= durationSeconds;

	useEffect(() => {
		if (shouldReduce) return undefined;
		const timer = setInterval(() => {
			setSeconds((current) => Math.min(current + 1, durationSeconds));
		}, 1000);
		return () => clearInterval(timer);
	}, [durationSeconds, shouldReduce]);

	// 곡 끝 지점에서 잠깐 머문 뒤 다음 곡으로 넘어가요 — 건너뛰기를 누른 것처럼
	useEffect(() => {
		if (shouldReduce || !advancing) return undefined;
		const timer = setTimeout(() => {
			const next = (trackIndex + 1) % TRACKS.length;
			setTrackIndex(next);
			setSeconds(Math.max(0, toSeconds(TRACKS[next].duration) - PREVIEW_TAIL_SECONDS));
		}, 900);
		return () => clearTimeout(timer);
	}, [advancing, shouldReduce, trackIndex]);

	return (
		<div className="flex flex-col gap-3 rounded-card bg-discord-embed p-3 sm:p-4">
			<div className="flex gap-3">
				<div className="flex min-w-0 flex-1 flex-col justify-between gap-1.5">
					<p className="text-2xs text-discord-text-muted">🎵 #음악-라운지 에서 재생 중 • 대기열 4곡 · 12:36 남음</p>
					<AnimatePresence mode="wait" initial={false}>
						<m.div
							key={track.title}
							initial={{ opacity: 0, y: 6 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -6 }}
							transition={{ duration: 0.25, ease: "easeOut" }}
						>
							<p className="line-clamp-2 text-sm font-bold leading-snug text-discord-text underline decoration-discord-text/20 underline-offset-2">
								{track.title}
							</p>
							<p className="truncate text-2xs text-discord-text-muted">아티스트: {track.artist}</p>
						</m.div>
					</AnimatePresence>
					<p className="truncate text-2xs text-discord-text-muted">
						신청자: <span className="rounded-sm bg-discord-primary/20 px-1 text-discord-light">@사용자</span>
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
				<p className="text-2xs text-discord-text-muted">📡 재생 서버: 시루-노드-01 | 🔊 볼륨: 100%</p>
				<span className="rounded-sm bg-discord-primary/10 px-1.5 py-1 text-2xs font-semibold text-discord-light">
					{fmtTime(seconds)} / {track.duration}
				</span>
			</div>
		</div>
	);
}

/** /채팅 — 도구 3종을 순환: 사용자 타이핑 → 시루가 생각 중.. → 답변 타이핑 */
function ChatPreview() {
	const [activeTool, setActiveTool] = useState(0);
	/** 0: 사용자 타이핑 중, 1: 봇 생각 중, 2: 답변 타이핑 */
	const [phase, setPhase] = useState(0);
	/** 다음 도구로 넘어가기 전 대기용 타이머 — 사용자가 탭 바꾸면 취소해야 함 */
	const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const current = utilities[activeTool];

	const clearAdvanceTimer = () => {
		if (advanceTimerRef.current) {
			clearTimeout(advanceTimerRef.current);
			advanceTimerRef.current = null;
		}
	};

	useEffect(() => clearAdvanceTimer, []);

	// 시퀀스: 사용자 타이핑 완료 → 생각 중 → 답변 타이핑 완료 → 다음 도구 (타이핑 종료 이벤트 기반)
	useEffect(() => {
		// reduced-motion에선 정적 답변을 바로 보여요
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			setPhase(2);
			return undefined;
		}
		if (phase === 0) {
			const timer = setTimeout(() => setPhase(1), 2100);
			return () => clearTimeout(timer);
		}
		if (phase === 1) {
			// 생각 중 표시 후 답변 타이핑으로 전환
			const timer = setTimeout(() => setPhase(2), 1200);
			return () => clearTimeout(timer);
		}
		return undefined;
	}, [phase, activeTool]);

	const advanceTool = () => {
		// 답변이 다 쳐지고 나서 몇 초간 읽을 시간을 준 뒤 다음 도구로 넘어가요
		clearAdvanceTimer();
		advanceTimerRef.current = setTimeout(() => {
			setActiveTool((prev) => (prev + 1) % utilities.length);
			setPhase(0);
		}, 2400);
	};

	const selectTool = (index: number) => {
		clearAdvanceTimer();
		setActiveTool(index);
		setPhase(0);
	};

	return (
		<div className="flex flex-col gap-3 p-3 sm:p-4">
			{/* 도구 인디케이터 */}
			<div className="flex items-center justify-between gap-2" role="tablist" aria-label="도구 예시">
				<p className="text-2xs font-semibold uppercase tracking-widest text-discord-text-muted">도구 예시</p>
				<div className="flex items-center gap-1.5">
					{utilities.map((utility, index) => (
						<button
							key={utility.title}
							type="button"
							role="tab"
							aria-selected={activeTool === index}
							aria-label={utility.title}
							onClick={() => selectTool(index)}
							className="group flex h-4 w-4 cursor-pointer items-center justify-center"
						>
							<span
								className={cn(
									"rounded-full transition-all duration-base",
									activeTool === index ? "h-2 w-2 bg-primary-control" : "h-1.5 w-1.5 bg-discord-btn-active group-hover:bg-discord-text-muted",
								)}
							/>
						</button>
					))}
				</div>
			</div>

			<div className="min-h-[150px] flex-1">
				<AnimatePresence mode="wait" initial={false}>
					<m.div
						key={current.title}
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -8 }}
						transition={{ duration: 0.25, ease: "easeOut" }}
						className="space-y-3"
					>
						{/* 1단계 — 사용자: 멘션 + 프롬프트 타이핑 */}
						<div className="flex gap-2.5">
							<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-discord-btn-active text-2xs font-bold text-discord-text">사</div>
							<div className="min-w-0 flex-1">
								<div className="flex items-baseline gap-2">
									<span className="text-sm font-semibold text-discord-text">사용자</span>
									<span className="text-2xs text-discord-text-muted">오후 8:11</span>
								</div>
								<p className="mt-1 flex flex-wrap items-center text-sm text-discord-text">
									<span className="mr-1 shrink-0 rounded-sm bg-discord-primary/20 px-1 text-discord-light">@시루</span>
									{phase === 0 ? (
										<TypingText key={`prompt-${current.title}`} texts={[current.prompt]} speed={70} className="min-w-0" />
									) : (
										<span className="min-w-0">{current.prompt}</span>
									)}
								</p>
							</div>
						</div>

						{/* 2·3단계 — 봇: 시루 프로필 + 이름/앱 배지/시간 → 생각 중 → 답변 타이핑 (히어로 카드와 같은 Discord 메시지 구조) */}
						{phase > 0 && (
							<m.div
								initial={{ opacity: 0, y: 8 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.3, ease: "easeOut" }}
								className="flex gap-2.5"
							>
								<div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full">
									<Image src="/images/profile.png" alt="시루" fill className="object-cover" sizes="32px" />
								</div>
								<div className="flex min-w-0 flex-1 flex-col gap-1">
									<div className="flex items-center gap-2">
										<span className="text-sm font-semibold text-discord-text">시루</span>
										<span className="rounded-sm bg-discord-primary px-1 py-0.5 text-2xs font-bold leading-none text-primary-control-text">앱</span>
										<span className="text-2xs text-discord-text-muted">오후 8:12</span>
									</div>
									<AnimatePresence mode="wait" initial={false}>
										{phase === 1 ? (
											<m.p
												key="thinking"
												initial={{ opacity: 0 }}
												animate={{ opacity: 1 }}
												exit={{ opacity: 0 }}
												transition={{ duration: 0.2 }}
												className="flex items-center gap-1.5 text-2xs font-medium text-discord-text-muted"
											>
												시루가 생각 중
												<span className="flex gap-0.5" aria-hidden>
													{[0, 1, 2].map((dot) => (
														<m.span
															key={dot}
															className="h-1 w-1 rounded-full bg-discord-text-muted"
															animate={{ opacity: [0.3, 1, 0.3] }}
															transition={{ duration: 1, repeat: Infinity, delay: dot * 0.2 }}
														/>
													))}
												</span>
											</m.p>
										) : (
											<m.div
												key="reply"
												initial={{ opacity: 0 }}
												animate={{ opacity: 1 }}
												transition={{ duration: 0.2 }}
											>
												<p className="mb-1 text-2xs font-medium text-discord-text-muted">
													{current.status} (완료)
												</p>
												<p className="text-sm leading-relaxed text-discord-text">
													<StreamingTypeText key={`reply-${current.title}`} text={current.reply} speed={40} onComplete={advanceTool} />
												</p>
											</m.div>
										)}
									</AnimatePresence>
								</div>
							</m.div>
						)}
					</m.div>
				</AnimatePresence>
			</div>
		</div>
	);
}

/** AI 채팅 프리뷰 — Discord 채널 프레임(헤더·푸터) 안에 타이핑 시뮬레이션을 담아요 */
function AiChatPreview() {
	return (
		<div className="flex min-w-0 flex-col overflow-hidden rounded-card bg-discord-embed">
			<div className="flex items-center gap-2 border-b border-discord-btn-active px-4 py-2.5">
				<Bot size={14} className="text-discord-text-muted" aria-hidden />
				<span className="text-xs font-semibold text-discord-text">ai-라운지</span>
				<span className="ml-auto text-2xs text-discord-text-muted">시루 · 멘션 응답</span>
			</div>
			<ChatPreview />
			<p className="border-t border-discord-btn-active px-4 py-2 text-2xs text-discord-text-muted">@시루 멘션으로 말 걸면 도구를 골라 써요.</p>
		</div>
	);
}

/** 보관함 프리뷰 — 앨범아트 스택 + 트랙 목록. 행들이 스태거로 등장해요 */
function PlaylistPreview() {
	return (
		<div className="space-y-3 rounded-card bg-surface-2 p-3">
			<div className="flex items-center gap-3 pb-3">
				{/* 앨범아트 2×2 스택 */}
				<div className="grid h-14 w-14 shrink-0 grid-cols-2 overflow-hidden rounded-md border border-border">
					{TRACKS.slice(0, 4).map((track) => (
						<div key={track.title} className="relative">
							<Image src={track.thumbnail} alt="" fill className="object-cover" sizes="28px" unoptimized />
						</div>
					))}
				</div>
				<div className="min-w-0 flex-1">
					<p className="truncate text-sm font-bold text-foreground">내 노래모음</p>
					<p className="truncate text-xs text-muted-foreground">5곡 · 17분</p>
				</div>
			</div>
			{/* 치트시트 03. 스태거 — 트랙 행들이 0.04초 간격으로 연쇄 등장 (칩 variants 재사용) */}
			<m.div variants={chipsContainerVariants} initial="hidden" animate="visible" className="space-y-0.5">
				{TRACKS.map((track, index) => (
					<m.div
						key={track.title}
						variants={chipVariants}
						className={cn(
							"flex min-w-0 items-center gap-2.5 rounded-sm px-1.5 py-1 text-sm transition-colors",
							index === 0 ? "bg-primary/8" : "hover:bg-surface-1",
						)}
					>
						<span className="w-3 shrink-0 text-2xs tabular-nums text-muted-foreground">{index + 1}</span>
						<div className="min-w-0 flex-1">
							<p className="truncate font-medium text-foreground">{track.title}</p>
						</div>
						<span className="shrink-0 text-2xs text-muted-foreground">{track.artist}</span>
						{index === 0 ? (
							<span className="flex shrink-0 items-end gap-0.5" aria-hidden>
								{[8, 12, 6, 10].map((h, i) => (
									<m.span
										key={i}
										className="w-0.5 rounded-full bg-primary-control"
										animate={{ height: [h, h + 4, h] }}
										transition={{ duration: 1, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
									/>
								))}
							</span>
						) : (
							<span className="shrink-0 text-2xs tabular-nums text-muted-foreground">{track.duration}</span>
						)}
					</m.div>
				))}
			</m.div>
		</div>
	);
}

/** 대시보드 프리뷰 — 좌측 설정 탭이 자동 순환하고, 행 값이 from → to 로 바뀌어요 */
function DashboardPreview() {
	const [activeSlide, setActiveSlide] = useState(0);
	const [autoPlay, setAutoPlay] = useState(true);

	useEffect(() => {
		if (!autoPlay) return undefined;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
		const timer = setInterval(() => setActiveSlide((prev) => (prev + 1) % dashboardSettingSlides.length), 7000);
		return () => clearInterval(timer);
	}, [autoPlay, activeSlide]);

	const handleSelect = (index: number) => {
		setAutoPlay(false);
		setActiveSlide(index);
	};

	return (
		<div className="flex flex-col gap-3 sm:flex-row">
			<div className="flex min-w-0 shrink-0 gap-2 overflow-x-auto sm:flex-col sm:overflow-visible" role="tablist" aria-label="설정 예시">
				{dashboardSettingSlides.map((slide, index) => (
					<button
						key={slide.label}
						type="button"
						role="tab"
						aria-selected={activeSlide === index}
						onClick={() => handleSelect(index)}
						className={cn(
							"flex shrink-0 cursor-pointer items-center gap-2 rounded-control px-2.5 py-1.5 text-left text-xs font-bold transition-colors duration-fast",
							activeSlide === index
								? "bg-primary/10 text-primary-text"
								: "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
						)}
					>
						<span
							className={cn(
								"rounded-full transition-all duration-base",
								activeSlide === index ? "h-2 w-2 bg-primary-control" : "h-1.5 w-1.5 bg-border",
							)}
						/>
						{slide.label}
					</button>
				))}
			</div>
			<div className="relative min-w-0 flex-1 overflow-hidden rounded-control bg-surface-2 p-3">
				<AnimatePresence mode="popLayout" initial={false}>
					<m.div
						key={dashboardSettingSlides[activeSlide].label}
						initial={{ opacity: 0, y: 12 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -12 }}
						transition={{ duration: 0.25, ease: "easeOut" }}
					>
						<SettingScroller slide={dashboardSettingSlides[activeSlide]} />
					</m.div>
				</AnimatePresence>
			</div>
		</div>
	);
}

/** 쇼케이스 탭 — 카드 그리드 대신 기능을 고르면 설명+데모가 함께 바뀌어요 */
const FEATURE_TABS = [
	{
		key: "music",
		label: "음악 재생",
		icon: Music2,
		title: "원하는 곡을 바로 재생해요.",
		desc: "/재생 한 줄로 곡을 찾아 다른 사람들과 함께 듣고, Discord 컨트롤러 버튼으로 일시정지·건너뛰기·반복을 해요.",
	},
	{
		key: "chat",
		label: "AI 채팅",
		icon: Bot,
		title: "명령어 대신 채팅으로 착.",
		desc: "명령어를 외우지 않아도 돼요. 멘션으로 말 걸면 시루가 날씨·검색·음악 제어 같은 도구를 직접 골라 써요.",
	},
	{
		key: "playlist",
		label: "내 음악 보관함",
		icon: ListMusic,
		title: "자주 듣는 곡을 모아둬요.",
		desc: "/플레이리스트와 /즐겨찾기로 곡을 저장하고, 불러온 목록을 채널에서 그대로 재생할 수 있어요.",
	},
	{
		key: "dashboard",
		label: "서버 대시보드",
		icon: LayoutDashboard,
		title: "웹에서 슝 슝, 봇에 바로 반영.",
		desc: "채널 지정부터 음악 기본값, 역할까지, 웹에서 바꾸면 Discord 서버에 그대로 적용돼요.",
	},
] as const;

type FeatureKey = (typeof FEATURE_TABS)[number]["key"];

export function FeaturesSection() {
	const [activeKey, setActiveKey] = useState<FeatureKey>("music");
	const activeTab = FEATURE_TABS.find((tab) => tab.key === activeKey) ?? FEATURE_TABS[0];
	const shouldReduce = useReducedMotion();

	return (
		<section id="features" className="pt-14 sm:pt-20 lg:pt-24">
			<div className="mx-auto w-full max-w-7xl space-y-8 px-4 sm:space-y-10 sm:px-6 lg:px-8">
				<m.div
					className="max-w-2xl space-y-3"
					initial="hidden"
					whileInView="visible"
					viewport={{ once: true, margin: "-80px" }}
					variants={sectionVariants}
				>
					<SectionLabel as="p" className="px-0 py-0">
						시루봇으로 할 수 있는 일
					</SectionLabel>
					<h2 className="text-3xl font-black tracking-tighter text-foreground sm:text-4xl lg:text-5xl">
						{HEADING_TEXT}
					</h2>
					<p className="text-base font-medium leading-relaxed text-muted-foreground sm:text-lg">
						명령어 한 줄로 음악을 시작하고, 서버 설정과 재생목록은 대시보드에서 손봐요. 재생 흐름은 Discord 안에서 끊기지 않게 이어져요.
					</p>
				</m.div>

				{/* 카드 그리드 대신 쇼케이스 — 기능 탭을 고르면 설명과 데모 패널이 함께 바뀌어요.
				    프리뷰는 골라진 것만 실행해요(타이머가 보이는 데모에서만 돌아가요) */}
				<m.div
					className="space-y-5"
					initial="hidden"
					whileInView="visible"
					viewport={{ once: true, margin: "-80px" }}
					variants={sectionVariants}
				>
					<div role="tablist" aria-label="시루봇 기능 미리보기" className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
						{FEATURE_TABS.map((tab) => (
							<button
								key={tab.key}
								type="button"
								role="tab"
								aria-selected={activeKey === tab.key}
								onClick={() => setActiveKey(tab.key)}
								className={cn(
									"flex shrink-0 cursor-pointer items-center gap-2 rounded-control px-3 py-2 text-sm font-bold transition-colors duration-fast",
									activeKey === tab.key
										? "bg-primary/10 text-primary-text"
										: "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
								)}
							>
								<tab.icon size={15} aria-hidden />
								{tab.label}
							</button>
						))}
					</div>

					<div className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start lg:gap-8">
						<AnimatePresence mode="wait" initial={false}>
							<m.div
								key={activeTab.key}
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -10 }}
								transition={{ duration: 0.25, ease: "easeOut" }}
								className="min-w-0 space-y-3"
							>
								<h3 className="text-2xl font-black tracking-tighter text-foreground sm:text-3xl">{activeTab.title}</h3>
								<p className="max-w-md text-sm font-medium leading-relaxed text-muted-foreground sm:text-base">{activeTab.desc}</p>
								{activeTab.key === "music" && (
									<div className="space-y-4 pt-1">
										{/* 치트시트 03. 스태거 — 칩들이 0.04초 간격으로 연쇄 등장. 탭 전환마다 다시 흘러요.
											reduced-motion에선 이동 없이 페이드만(선례: hero-section 조건부 variants) */}
										<m.ul variants={chipsContainerVariants} initial="hidden" animate="visible" className="flex flex-wrap gap-2">
											{["/재생", "/검색", "/현재곡", "/대기열", "/볼륨", "/셔플", "/일시정지", "/가사"].map((command) => (
												<m.li key={command} variants={shouldReduce ? chipFadeVariants : chipVariants} className={COMMAND_TOKEN}>
													{command}
												</m.li>
											))}
										</m.ul>
										<div className="grid grid-cols-2 gap-3">
											<div>
												<p className="text-2xs font-medium text-muted-foreground">지원 음원</p>
												<p className="mt-1 text-sm font-black tracking-tighter text-foreground">YouTube · Spotify</p>
											</div>
											<div>
												<p className="text-2xs font-medium text-muted-foreground">오디오</p>
												<p className="mt-1 text-sm font-black tracking-tighter text-foreground">크로스페이드 지원</p>
											</div>
										</div>
									</div>
								)}
								{activeTab.key === "chat" && (
									<div className="grid gap-4 pt-1 sm:grid-cols-3">
										{utilities.map((utility) => (
											<div key={utility.title} className="flex gap-2.5">
												<utility.icon size={15} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
												<div className="min-w-0 space-y-1">
													<p className="text-sm font-black tracking-tighter text-foreground">{utility.title}</p>
													<p className="text-xs font-medium leading-relaxed text-muted-foreground">{utility.desc}</p>
												</div>
											</div>
										))}
									</div>
								)}
								{/* 블록마다 곧장 갈 수 있는 행동 CTA 세트 — 보조 링크는 보관함·대시보드 탭만 */}
								<div className="flex flex-wrap items-center gap-2.5 pt-1">
									<Link href="/invite" className={buttonVariants({ variant: "cta" })}>
										시루봇 초대하기
									</Link>
									{activeTab.key === "playlist" && (
										<Link href="/playlists" className={secondaryLink}>
											대시보드에서 보관함 관리
										</Link>
									)}
									{activeTab.key === "dashboard" && (
										<Link href="/servers" className={secondaryLink}>
											서버 관리 시작하기
										</Link>
									)}
								</div>
							</m.div>
						</AnimatePresence>

						<div className="relative min-w-0 lg:min-h-[400px]">
							<AnimatePresence mode="wait" initial={false}>
								<m.div
									key={activeTab.key}
									initial={{ opacity: 0, y: 14 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, y: -14 }}
									transition={{ duration: 0.3, ease: "easeOut" }}
									className="min-w-0"
								>
									{activeTab.key === "music" && (
										<div className="relative pb-9 pr-2">
											<PlayerPreview />
											{/* MEE6식 레이어드 콜라주: 실제 제품 상태(대기열에 1곡 추가)를 부유 알림 카드로 겹쳐요 */}
											<div
												aria-hidden
												className="absolute bottom-0 left-2 w-60 -rotate-2 space-y-1.5 rounded-card bg-surface-1 p-3 shadow-lg sm:left-6"
											>
												<p className="text-2xs font-medium text-muted-foreground">대기열에 추가됨</p>
												<div className="flex items-center gap-2">
													<span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-sm">
														<Image src={TRACKS[2].thumbnail} alt="" fill className="object-cover" sizes="32px" unoptimized />
													</span>
													<div className="min-w-0">
														<p className="truncate text-xs font-bold text-foreground">아이돌 (Idol)</p>
														<p className="truncate text-2xs text-muted-foreground">YOASOBI</p>
													</div>
													<span className="ml-auto shrink-0 rounded-sm bg-primary/10 px-1.5 py-0.5 text-2xs font-bold text-primary-text">+1곡</span>
												</div>
											</div>
											<div
												aria-hidden
												className="absolute -top-3 right-3 rotate-2 rounded-card bg-surface-1 p-2.5 shadow-lg sm:-top-4 sm:right-5"
											>
												<span className={COMMAND_TOKEN}>/음악 재생</span>
											</div>
										</div>
									)}
									{activeTab.key === "chat" && (
										<div className="relative pb-9 pr-2">
											<AiChatPreview />
											{/* 데모가 순환하는 도구 3종을 부유 카드로 다시 보여줘요 */}
											<div
												aria-hidden
												className="absolute bottom-0 right-3 w-56 rotate-2 space-y-1 rounded-card bg-surface-1 p-3 shadow-lg sm:right-5"
											>
												<p className="text-2xs font-medium text-muted-foreground">시루가 골라 쓰는 도구</p>
												<p className="flex items-center gap-1.5 text-xs font-bold text-foreground">
													<Check size={13} className="shrink-0 text-success" aria-hidden />
													음악 · 생활 정보 · 장기 기억
												</p>
											</div>
										</div>
									)}
									{activeTab.key === "playlist" && (
										<div className="relative pb-9 pr-2">
											<PlaylistPreview />
											{/* 재생 중 상태 — 보관함 데모의 이퀄라이저와 같은 모티프 */}
											<div
												aria-hidden
												className="absolute bottom-0 left-2 flex w-52 -rotate-2 items-center gap-2.5 rounded-card bg-surface-1 p-3 shadow-lg sm:left-8"
											>
												<span className="flex shrink-0 items-end gap-0.5">
													{[8, 12, 6, 10].map((h, i) => (
														<m.span
															key={i}
															className="w-0.5 rounded-full bg-primary-control"
															animate={{ height: [h, h + 4, h] }}
															transition={{ duration: 1, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
														/>
													))}
												</span>
												<div className="min-w-0">
													<p className="truncate text-2xs font-bold text-foreground">내 노래모음 재생 중</p>
													<p className="text-2xs text-muted-foreground">채널에서 이어서 재생</p>
												</div>
											</div>
										</div>
									)}
									{activeTab.key === "dashboard" && (
										<div className="relative pb-9 pr-2">
											<DashboardPreview />
											{/* 실제 동작 — 웹 저장은 봇에 바로 반영돼요 */}
											<div
												aria-hidden
												className="absolute bottom-0 right-3 flex w-48 rotate-2 items-center gap-2 rounded-card bg-surface-1 p-3 shadow-lg sm:right-5"
											>
												<Check size={13} className="shrink-0 text-success" aria-hidden />
												<div className="min-w-0">
													<p className="text-xs font-bold text-foreground">변경사항 저장됨</p>
													<p className="text-2xs text-muted-foreground">봇에 바로 반영</p>
												</div>
											</div>
										</div>
									)}
								</m.div>
							</AnimatePresence>
						</div>
					</div>
				</m.div>

			</div>

			{/* 마지막 CTA — 푸터 앞 브랜드 풀블리드 밴드 (한 화면에 강한 마무리 동작 하나) */}
			<m.div
				className="mt-16 sm:mt-24"
				initial="hidden"
				whileInView="visible"
				viewport={{ once: true, margin: "-60px" }}
				variants={sectionVariants}
			>
				<div className="bg-primary-control">
					<div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-4 py-12 text-center sm:px-6 sm:py-16">
						<h2 className="text-2xl font-black tracking-tighter text-primary-control-text sm:text-3xl lg:text-4xl">준비되셨나요?</h2>
						<p className="max-w-md text-sm font-medium leading-relaxed text-primary-control-text/85 sm:text-base">
							지금 시루봇을 서버에 초대하면 음악·AI 채팅·서버 관리가 바로 시작돼요.
						</p>
						<Link
							href="/invite"
							className={cn(
								buttonVariants({ variant: "cta", size: "lg" }),
								"mt-2 h-11 w-full bg-surface-1 text-base text-foreground hover:bg-surface-3 sm:w-auto sm:px-8",
							)}
						>
							시루봇 초대하기
						</Link>
					</div>
				</div>
			</m.div>
		</section>
	);
}