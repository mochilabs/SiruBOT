"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { Bot, Brain, CloudSun, LayoutDashboard, ListMusic, Music2, Pause, Play, Repeat, SkipForward } from "lucide-react";

import { buttonVariants } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { SectionLabel } from "@/components/primitives/section-label";
import { StreamingTypeText } from "@/components/streaming-type-text";
import { TypingText } from "@/components/typing-text";
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

const COMMAND_TOKEN = "rounded-sm bg-muted px-1.5 py-0.5 text-2xs font-bold text-foreground/70";

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
 * 명령어 칩 전용 variants (치트시트 03 스태거 보강) —
 * 부모 카드의 whileInView 상태가 전파되어 칩들이 0.04초 간격으로 연쇄 등장해요. 서브 스태거라 가볍게.
 * reduced-motion에선 chipVariants 대신 chipFadeVariants(opacity만)를 쓰고, 부모 카드가
 * sectionVariants(opacity+y 위치 애니)로 폴백되면 위치 속성은 프레임워크가 자동 중립해요.
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

/**
 * 대시보드 설정 프리뷰 — 스크롤 스크롤 넘어가며 값이 토글되는 추상 설정 리스트.
 * 각 행이 "이전 값 → 새 값"으로 슥 바뀌고, 리스트가 세로로 슝 넘어가요.
 */
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
									activeTool === index ? "h-2 w-2 bg-discord-primary" : "h-1.5 w-1.5 bg-discord-btn-active group-hover:bg-discord-text-muted",
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
							<div className="flex min-w-0 flex-wrap items-center text-sm text-discord-text">
								<span className="mr-1 shrink-0 rounded-sm bg-discord-primary/20 px-1 text-discord-light">@시루</span>
								{phase === 0 ? (
									<TypingText key={`prompt-${current.title}`} texts={[current.prompt]} speed={70} className="min-w-0" />
								) : (
									<span className="min-w-0">{current.prompt}</span>
								)}
							</div>
						</div>

						{/* 2·3단계 — 봇: 생각 중 → 답변 타이핑 */}
						{phase > 0 && (
							<m.div
								initial={{ opacity: 0, y: 8 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.3, ease: "easeOut" }}
								className="flex gap-2.5"
							>
								<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-discord-primary text-2xs font-bold text-primary-foreground">시</div>
								<div className="min-w-0 flex-1">
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

export function FeaturesSection() {
	const [activeSettingSlide, setActiveSettingSlide] = useState(0);
	const [settingAutoPlay, setSettingAutoPlay] = useState(true);

	const shouldReduce = useReducedMotion();
	const cardEntry = sectionVariants;

	useEffect(() => {
		if (!settingAutoPlay) return undefined;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
		const timer = setInterval(() => setActiveSettingSlide((prev) => (prev + 1) % dashboardSettingSlides.length), 7000);
		return () => clearInterval(timer);
	}, [settingAutoPlay, activeSettingSlide]);

	const handleSettingSelect = (index: number) => {
		setSettingAutoPlay(false);
		setActiveSettingSlide(index);
	};

	return (
		<section id="features" className="py-14 sm:py-20 lg:py-24">
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

			<m.div
				className="grid gap-4 lg:grid-cols-2 lg:gap-5"
				initial="hidden"
				whileInView="visible"
				viewport={{ once: true, margin: "-60px" }}
				transition={{ staggerChildren: 0.08 }}
			>
				{/* 1. AI 채팅 — 가장 중요 */}
			<m.div variants={cardEntry} className="lg:col-span-2 min-w-0">
				<Card padding="lg" className="gap-6 lg:grid lg:grid-cols-2 lg:gap-8">
					<div className="flex min-w-0 flex-col gap-4">
						<div className="flex items-center gap-2.5">
							<Bot size={18} className="text-primary-text" aria-hidden />
								<SectionLabel as="p" className="px-0 py-0 text-primary-text">
									AI 채팅
								</SectionLabel>
							</div>
							<h3 className="text-2xl font-black tracking-tighter text-foreground sm:text-3xl">명령어 대신 채팅으로 착.</h3>
							<p className="max-w-md text-sm font-medium leading-relaxed text-muted-foreground sm:text-base">
								명령어를 외우지 않아도 돼요. 멘션으로 말 걸면 시루가 날씨·검색·음악 제어 같은 도구를 직접 골라 써요.
							</p>
							<div className="grid gap-4 border-t border-border-subtle pt-4 sm:grid-cols-3">
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
						</div>
					<div className="flex min-w-0 flex-col overflow-hidden rounded-card border border-border-subtle bg-discord-embed">
						<div className="flex items-center gap-2 border-b border-discord-btn-active px-4 py-2.5">
							<Bot size={14} className="text-discord-text-muted" aria-hidden />
							<span className="text-xs font-semibold text-discord-text">ai-라운지</span>
							<span className="ml-auto text-2xs text-discord-text-muted">시루 · 멘션 응답</span>
						</div>
						<ChatPreview />
						<p className="border-t border-discord-btn-active px-4 py-2 text-2xs text-discord-text-muted">
							@시루 멘션으로 말 걸면 도구를 골라 써요.
						</p>
					</div>
				</Card>
			</m.div>

			{/* 2. 명령어 소개 — 음악 재생 */}
			<m.div variants={cardEntry} className="lg:col-span-2 min-w-0">
				<Card variant="raised" padding="lg" className="gap-6 lg:grid lg:grid-cols-2 lg:gap-8">
					<div className="flex min-w-0 flex-col gap-4">
						<div className="flex items-center gap-2.5">
							<Music2 size={18} className="text-primary-text" aria-hidden />
							<SectionLabel as="p" className="px-0 py-0 text-primary-text">
								음악 재생
							</SectionLabel>
						</div>
						<h3 className="text-2xl font-black tracking-tighter text-foreground sm:text-3xl">원하는 곡을 바로 재생해요.</h3>
						<p className="max-w-md text-sm font-medium leading-relaxed text-muted-foreground sm:text-base">
							/재생 한 줄로 곡을 찾아 다른 사람들과 함께 듣고, Discord 컨트롤러 버튼으로 일시정지·건너뛰기·반복을 해요.
						</p>
						{/* 치트시트 03. 스태거 보강 — 명령어 칩들이 빠르게 연쇄 등장(0.04초 간격).
							reduced-motion에선 이동 없이 페이드만(선례: hero-section 조건부 variants) */}
						<m.ul variants={chipsContainerVariants} className="flex flex-wrap gap-2">
							{["/재생", "/검색", "/현재곡", "/대기열", "/볼륨", "/셔플", "/일시정지", "/가사"].map((command) => (
								<m.li key={command} variants={shouldReduce ? chipFadeVariants : chipVariants} className={COMMAND_TOKEN}>
									{command}
								</m.li>
							))}
						</m.ul>
						<div className="mt-0 grid grid-cols-2 gap-3 border-t border-border-subtle">
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
					<div className="flex flex-col gap-3 rounded-card border border-border-subtle bg-discord-embed p-3 sm:p-4">
						{/* controllerView 본문 — Section(텍스트 + 우측 썸네일) 구조 그대로 */}
						<div className="flex gap-3">
							<div className="flex min-w-0 flex-1 flex-col justify-between gap-1.5">
								<p className="text-2xs text-discord-text-muted">🎵 #음악-라운지 에서 재생 중 • 대기열 4곡 · 12:36 남음</p>
								<p className="line-clamp-2 text-sm font-bold leading-snug text-discord-text underline decoration-discord-text/20 underline-offset-2">{TRACKS[0].title}</p>
								<p className="truncate text-2xs text-discord-text-muted">아티스트: {TRACKS[0].artist}</p>
								<p className="truncate text-2xs text-discord-text-muted">신청자: <span className="rounded-sm bg-discord-primary/20 px-1 text-discord-light">@사용자</span></p>
								<div className="flex items-center gap-2 text-2xs tabular-nums text-discord-text-muted">
									<span>0:43 / 4:40</span>
									<div className="h-1 flex-1 overflow-hidden rounded-full bg-discord-btn-active">
										<m.div
											className="h-full rounded-full bg-discord-primary"
											initial={{ width: "0%" }}
											whileInView={{ width: "25%" }}
											viewport={{ once: true }}
											transition={{ duration: 1.2, ease: "linear" }}
										/>
									</div>
								</div>
							</div>
							<div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-discord-btn-active sm:h-20 sm:w-20">
								<Image src={TRACKS[0].thumbnail} alt="" fill className="object-cover" sizes="80px" unoptimized />
							</div>
						</div>
						{/* ActionRow — ⏮ ⏸ ⏭ 🔂 📄 대기열 */}
						<div className="flex items-center gap-2">
							<span className="flex h-8 w-10 items-center justify-center rounded-md bg-discord-btn-active text-discord-text" aria-hidden>
								<SkipForward size={13} className="rotate-180" fill="currentColor" />
							</span>
							<span className="flex h-8 w-10 items-center justify-center rounded-md bg-discord-btn-active text-discord-text" aria-hidden>
								<Pause size={13} fill="currentColor" />
							</span>
							<span className="flex h-8 w-10 items-center justify-center rounded-md bg-discord-btn-active text-discord-text-muted" aria-hidden>
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
							<span className="rounded-sm bg-discord-primary/10 px-1.5 py-1 text-2xs font-semibold text-discord-light">0:43 / 4:40</span>
						</div>
					</div>
				</Card>
			</m.div>

			{/* 3. 내 음악 보관함 */}
			<m.div variants={cardEntry} className="flex flex-col min-w-0">
				<Card padding="lg" className="h-full gap-5">
					<div className="flex items-center gap-2.5">
						<ListMusic size={18} className="text-primary-text" aria-hidden />
						<SectionLabel as="p" className="px-0 py-0 text-primary-text">
							내 음악 보관함
						</SectionLabel>
					</div>
					<h3 className="text-xl font-black tracking-tighter text-foreground">자주 듣는 곡을 모아둬요.</h3>
					<p className="text-sm font-medium leading-relaxed text-muted-foreground">
						/플레이리스트와 /즐겨찾기로 곡을 저장하고, 불러온 목록을 채널에서 그대로 재생할 수 있어요.
					</p>

					{/* 플레이리스트 카드 — 앨범아트 스택 + 트랙 리스트 */}
					<div className="flex-1 space-y-3 rounded-card border border-border-subtle bg-surface-2 p-3">
						<div className="flex items-center gap-3 border-b border-border-subtle pb-3">
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
							<span className="flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-control bg-primary-control px-2 text-2xs font-bold text-primary-foreground transition-colors hover:bg-primary-control-hover">
								<Play size={11} fill="currentColor" aria-hidden />
								재생
							</span>
						</div>
						<div className="space-y-0.5">
							{TRACKS.map((track, index) => (
								<div
									key={track.title}
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
										<span className="flex shrink-0 items-end gap-[2px]" aria-hidden>
											{[8, 12, 6, 10].map((h, i) => (
												<m.span
													key={i}
													className="w-[2px] rounded-full bg-primary"
													animate={{ height: [h, h + 4, h] }}
													transition={{ duration: 1, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
												/>
											))}
										</span>
									) : (
										<span className="shrink-0 text-2xs tabular-nums text-muted-foreground">{track.duration}</span>
									)}
								</div>
							))}
						</div>
					</div>

					<Link href="/playlists" className={cn(secondaryLink, "mt-auto self-start")}>
						대시보드에서 보관함 관리
					</Link>
				</Card>
			</m.div>

				{/* 4. 서버 대시보드 */}
				<m.div variants={cardEntry} className="flex flex-col min-w-0">
					<Card padding="lg" className="h-full gap-5">
						<div className="flex items-center gap-2.5">
							<LayoutDashboard size={18} className="text-primary-text" aria-hidden />
							<SectionLabel as="p" className="px-0 py-0 text-primary-text">
								서버 대시보드
							</SectionLabel>
						</div>
						<h3 className="text-xl font-black tracking-tighter text-foreground">웹에서 슝 슝, 봇에 바로 반영.</h3>
						<p className="text-sm font-medium leading-relaxed text-muted-foreground">
							채널 지정부터 음악 기본값, 역할까지, 웹에서 바꾸면 Discord 서버에 그대로 적용돼요.
						</p>

						{/* 설정 카드 — 좌측 패널 탭 + 우측 토글 애니메이션 */}
						<div className="flex flex-1 flex-col gap-3 border-t border-border-subtle pt-4 sm:flex-row">
							<div className="flex min-w-0 shrink-0 gap-2 overflow-x-auto sm:flex-col sm:overflow-visible" role="tablist" aria-label="설정 예시">
								{dashboardSettingSlides.map((slide, index) => (
									<button
										key={slide.label}
										type="button"
										role="tab"
										aria-selected={activeSettingSlide === index}
										onClick={() => handleSettingSelect(index)}
										className={cn(
											"flex shrink-0 cursor-pointer items-center gap-2 rounded-control px-2.5 py-1.5 text-left text-xs font-bold transition-colors duration-fast",
											activeSettingSlide === index
												? "bg-primary/10 text-primary-text"
												: "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
										)}
									>
										<span
											className={cn(
												"rounded-full transition-all duration-base",
												activeSettingSlide === index ? "h-2 w-2 bg-primary" : "h-1.5 w-1.5 bg-border",
											)}
										/>
										{slide.label}
									</button>
								))}
							</div>
							<div className="relative min-w-0 flex-1 overflow-hidden rounded-control border border-border-subtle bg-surface-2 p-3">
								<AnimatePresence mode="popLayout" initial={false}>
									<m.div
										key={dashboardSettingSlides[activeSettingSlide].label}
										initial={{ opacity: 0, y: 12 }}
										animate={{ opacity: 1, y: 0 }}
										exit={{ opacity: 0, y: -12 }}
										transition={{ duration: 0.25, ease: "easeOut" }}
									>
										<SettingScroller slide={dashboardSettingSlides[activeSettingSlide]} />
									</m.div>
								</AnimatePresence>
							</div>
						</div>

						<Link href="/servers" className={cn(secondaryLink, "mt-auto")}>
							서버 관리 시작하기
						</Link>
					</Card>
				</m.div>
			</m.div>

			{/* 마지막 CTA — 준비되셨나요? */}
			<m.div
				className="relative overflow-hidden rounded-card border border-primary/25 bg-gradient-to-br from-primary/15 via-surface-2 to-secondary/10 px-6 py-10 text-center sm:px-8 sm:py-14"
				initial="hidden"
				whileInView="visible"
				viewport={{ once: true, margin: "-60px" }}
				variants={sectionVariants}
			>
				{/* 배경 효과 — 중앙에서 퍼지는 브랜드 라디얼 */}
				<div
					aria-hidden
					className="pointer-events-none absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/12 blur-3xl"
				/>
				<div className="relative mx-auto max-w-xl space-y-4">
					<h2 className="text-2xl font-black tracking-tighter text-foreground sm:text-3xl">준비되셨나요?</h2>
					<p className="text-sm font-medium leading-relaxed text-muted-foreground sm:text-base">
						지금 시루봇을 서버에 초대하면
						<br className="sm:hidden" />
						음악·AI 채팅·서버 관리가 바로 시작돼요.
					</p>
					<div className="flex flex-col items-center justify-center gap-3 pt-2 sm:flex-row">
						<Link
							href="/invite"
							className={cn(buttonVariants({ variant: "cta", size: "lg" }), "h-11 w-full text-base sm:w-auto")}
						>
							시루봇 초대하기
						</Link>
						<Link
							href="/servers"
							className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "h-11 w-full text-base sm:w-auto")}
						>
							대시보드 둘러보기
						</Link>
					</div>
				</div>
			</m.div>

		</div>
		</section>
	);
}