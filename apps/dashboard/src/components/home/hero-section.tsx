"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, m, useInView, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, ChevronDown, LayoutDashboard } from "lucide-react";

import { DiscordCommandAnimation, slideConfigs } from "@/components/home/discord-command-animation";
import { SectionLabel } from "@/components/primitives/section-label";
import { buttonVariants } from "@/components/ui/button";
import { useCountUp } from "@/hooks/use-count-up";
import { cn } from "@/lib/utils";

const SLIDE_INTERVAL = 7000;
// 헤드라인 회전 단어 — "시루봇과 함께 ___ 만들어봐요"의 빈칸에 아래에서 위로 밀려 올라와 교체돼요
const ROTATING_WORDS = ['더 즐거운 서버를', '심심할 틈 없는 서버를', '활기찬 서버를'] as const;
const ROTATE_INTERVAL_MS = 2600;
// whileInView 진입 조건 — 세 무빙 블록(container/진행 버튼/디스코드 프레임)이 같은 조건을 공유
const REVEAL_VIEWPORT = { once: true, margin: '-60px' } as const;

// 리빌 단어 조각 — 단어 뒤 공백을 조각에 포함해(whitespace-pre) inline-block 스팬 간 간격을 유지하고
// 스크린 리더에도 "시루봇과 함께"처럼 공백이 살아있게 해요. 하단 문장은 조각 하나라 문자열 상수로 충분해요.
const SPLIT_HEADLINE_TOP = ['시루봇과 ', '함께'] as const;
const SPLIT_HEADLINE_BOTTOM = '만들어봐요';

/** 랜딩 히어로 통계 숫자 — 뷰포트 진입 시 카운트업 ("45개", "28K+" 같은 접미사 유지) */
function CountUpStat({ end, suffix }: { end: number; suffix?: string }) {
	const { ref, value } = useCountUp({ end });

	return (
		<span ref={ref} className="tabular-nums">
			{Math.round(value).toLocaleString("ko-KR")}
			{suffix}
		</span>
	);
}

const containerVariants = {
	hidden: { opacity: 0 },
	visible: { opacity: 1, transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
} as const;

const itemVariants = {
	hidden: { opacity: 0, y: 24 },
	visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 90, damping: 18 } },
} as const;

/**
 * 헤드라인 리빌 — 정적 단어는 blur+떠오름으로 개별 등장, 회전 단어 세그먼트는 variants로 한 덩어리 등장.
 */
const headlineVariants = {
	hidden: {},
	visible: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
} as const;

const headlineWordVariants = {
	hidden: { opacity: 0, y: 22, filter: "blur(6px)" },
	visible: {
		opacity: 1,
		y: 0,
		filter: "blur(0px)",
		transition: { type: "spring", stiffness: 120, damping: 20 }
	},
} as const;

/** 회전 단어 세그먼트 등장 — 워드 리빌 스태거 끝에 자연스럽게 붙도록 스프링 파라미터를 맞췄어요 */
const headlineRotatorVariants = {
	hidden: { opacity: 0, y: 14 },
	visible: {
		opacity: 1,
		y: 0,
		transition: { type: "spring", stiffness: 120, damping: 20 }
	},
} as const;

/**
 * 헤드라인 단어 회전기 — 현재 단어가 위로 빠지면서 다음 단어가 아래에서 올라와요.
 * 폭은 "정착 완료된" 단어 기준 sizer가 잡아요: 교체 애니메이션 중에는 이전 폭을 유지해
 * 뒤따르는 "만들어봐요"가 애니메이션 도중 점프하지 않고, 완료와 함께 한 번만 이동해요.
 * reduced-motion 환경에선 MotionConfig가 슬라이드를 자동으로 페이드로 낮춰요.
 * 마스크 하단 패딩은 자모 받침 클리핑 방지용이에요.
 */
function WordRotator() {
	const [index, setIndex] = useState(0);
	const [settledIndex, setSettledIndex] = useState(0);

	useEffect(() => {
		const timer = setInterval(() => setIndex((prev) => (prev + 1) % ROTATING_WORDS.length), ROTATE_INTERVAL_MS);
		return () => clearInterval(timer);
	}, []);

	return (
		<span className="relative inline-block overflow-hidden whitespace-pre pb-[0.12em] -mb-[0.12em] align-bottom">
			{/* 폭 sizer — 보이지 않지만 레이아웃을 잡아요 (교체 중에는 이전 단어 폭 유지) */}
			<span className="invisible" aria-hidden>
				{ROTATING_WORDS[settledIndex]}
			</span>
			<AnimatePresence initial={false}>
				<m.span
					key={ROTATING_WORDS[index]}
					className="absolute inset-0 flex justify-center lg:justify-start"
					initial={{ y: "110%", opacity: 0 }}
					animate={{ y: "0%", opacity: 1 }}
					exit={{ y: "-110%", opacity: 0 }}
					transition={{ type: "spring", stiffness: 260, damping: 32 }}
					onAnimationComplete={() => setSettledIndex(index)}
				>
					{ROTATING_WORDS[index]}
				</m.span>
			</AnimatePresence>
		</span>
	);
}

export function HeroSection() {
	const [activeSlide, setActiveSlide] = useState(0);
	const [autoPlay, setAutoPlay] = useState(true);
	const heroRef = useRef<HTMLElement>(null);

	// 히어로 스크롤 진행도 — 스크롤 유도 힌트의 페이드아웃/비활성에 써요.
	// 성능: transform 기반으로 리렌더 없이 동작하고, reduced-motion 환경에선 정지 유지.
	const shouldReduce = useReducedMotion();
	const { scrollYProgress } = useScroll({
		target: heroRef,
		offset: ["start start", "end start"]
	});

	// 스크롤 유도 버튼 — 0~20% 구간에서 페이드아웃(useTransform, 리렌더 없음),
	// 15%를 넘으면 visibility:hidden 토글로 버튼 클릭·포커스를 차단해요.
	const hintOpacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);
	const [hintHidden, setHintHidden] = useState(false);
	useMotionValueEvent(scrollYProgress, "change", (latest) => {
		setHintHidden(latest > 0.15);
	});

	// 히어로 진입 판정 — whileInView 마진과 같은 -60px 기준으로 20% 이상 보이면 활성화
	const heroInView = useInView(heroRef, {
		once: true,
		amount: 0.2,
		margin: "-60px"
	});

	useEffect(() => {
		if (!autoPlay || !heroInView || shouldReduce) return undefined;
		const timer = setInterval(() => setActiveSlide((prev) => (prev + 1) % slideConfigs.length), SLIDE_INTERVAL);
		return () => clearInterval(timer);
	}, [autoPlay, heroInView, shouldReduce]);

	const handleSlideChange = (index: number) => {
		setAutoPlay(false);
		setActiveSlide(index);
	};

	return (
		<section ref={heroRef} id="hero-section" className="relative overflow-hidden">
			<div className="relative mx-auto grid min-h-[calc(100svh-var(--navbar-h))] w-full max-w-7xl content-center gap-10 px-4 pb-14 pt-8 sm:px-6 sm:pb-16 sm:pt-16 lg:grid-cols-[minmax(0,0.9fr)_auto] lg:items-center lg:gap-14 lg:px-8 lg:pb-20 lg:pt-20">
				<m.div
					className="flex min-w-0 flex-col items-center gap-7 text-center lg:items-start lg:text-left"
					variants={containerVariants}
					initial="hidden"
					whileInView="visible"
					viewport={REVEAL_VIEWPORT}
				>
					<m.h1
						variants={shouldReduce ? itemVariants : headlineVariants}
						className="text-4xl font-black leading-tight tracking-tighter text-foreground break-keep sm:text-5xl lg:text-6xl"
					>
						{shouldReduce ? (
							// 접근성 폴백 — reduced-motion 환경에선 단어 분해·회전 없이 정적 헤드라인으로 표시해요
							<>
								시루봇과 함께
								<br />
								<span className="text-primary-text">{ROTATING_WORDS[0]}</span>
								<br />
								만들어봐요
							</>
						) : (
							<>
								{SPLIT_HEADLINE_TOP.map((word) => (
									<m.span key={word} className="inline-block whitespace-pre" variants={headlineWordVariants}>
										{word}
									</m.span>
								))}
								{/* 회전 단어와 "만들어봐요"를 각각 고정한 줄로 둬요 — 단어 길이에 따라
								    만들어봐요가 줄을 오가며 레이아웃이 출렁이는 걸 막기 위한 3줄 고정 구조예요. */}
								<br />
								<m.span className="inline-block whitespace-pre text-primary-text" variants={headlineRotatorVariants}>
									<WordRotator />
								</m.span>
								<br />
								<m.span className="inline-block whitespace-pre" variants={headlineWordVariants}>
									{SPLIT_HEADLINE_BOTTOM}
								</m.span>
							</>
						)}
					</m.h1>

					<m.p
						variants={itemVariants}
						className="max-w-xl text-base font-medium leading-relaxed text-muted-foreground break-keep sm:text-lg lg:mx-0"
					>
						음악 재생부터 AI 채팅, 서버 관리까지.
						<br className="hidden sm:block" />
						채널 한 곳에서 끊김 없이 이어지는 Discord 봇이에요.
					</m.p>

					<m.div variants={itemVariants} className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row lg:justify-start">
						<Link href="/invite" className={cn(buttonVariants({ variant: "cta", size: "lg" }), "group h-11 w-full text-base sm:w-auto")}>
							지금 초대하기
							<ArrowRight size={17} aria-hidden className="transition-transform duration-fast group-hover:translate-x-0.5" />
						</Link>
						<Link href="/servers" className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "h-11 w-full text-base sm:w-auto")}>
							<LayoutDashboard size={17} aria-hidden />
							대시보드 시작하기
						</Link>
					</m.div>

					<m.dl
						variants={itemVariants}
						className="grid w-full grid-cols-2 gap-4 pt-2 sm:max-w-lg lg:max-w-none"
					>
						<div>
							<dt className="text-xs font-medium text-muted-foreground">슬래시 명령어</dt>
							<dd className="mt-1 text-lg font-black tracking-tighter text-foreground sm:text-xl">
								{/* 실측: 2026-10-09, 톱레벨 extends Command 23 + 서브커맨드 49(인라인 31 + 파일 18) */}
								<CountUpStat end={72} suffix="개" />
							</dd>
						</div>
						<div>
							<dt className="text-xs font-medium text-muted-foreground">기능 카테고리</dt>
							<dd className="mt-1 text-lg font-black tracking-tighter text-foreground sm:text-xl">
								<CountUpStat end={4} suffix="종" />
							</dd>
						</div>
					</m.dl>
				</m.div>

				{/* 우측 목업 컬럼 — self-stretch으로 그리드 행 높이를 가득 채우고, xl 이상에서 폭도 넓혀 대형 헤드라인과 균형을 맞춰요 */}
				<div className="flex min-w-0 flex-col gap-3 lg:w-[500px] lg:self-stretch lg:justify-self-end xl:w-[560px]">
					<m.div
						className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
						initial={{ opacity: 0, y: 12 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={REVEAL_VIEWPORT}
						transition={{ delay: 0.35, duration: 0.4, ease: "easeOut" }}
					>
						<SectionLabel as="p" className="px-0">
							Discord에서 이렇게 동작해요
						</SectionLabel>
						<div
							className="flex flex-wrap gap-2"
							role="group"
							aria-label="명령어 예시 선택"
							onMouseEnter={() => setAutoPlay(false)}
							onMouseLeave={() => setAutoPlay(true)}
						>
							{slideConfigs.map((slide, index) => (
								<button
									key={slide.command}
									type="button"
									onClick={() => handleSlideChange(index)}
									aria-pressed={activeSlide === index}
									className={cn(
										"relative cursor-pointer overflow-hidden rounded-control border-0 px-3 py-1.5 text-xs font-bold transition-colors duration-fast",
										activeSlide === index
											? "bg-primary-control text-primary-control-text"
											: "bg-surface-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground",
									)}
								>
									{/* 자동 재생 진행률 — 활성 버튼이 7초에 걸쳐 차오르고, 차면 다음 예시로 넘어가요 */}
									{activeSlide === index && autoPlay && heroInView ? (
										<m.span
											aria-hidden
											className="absolute inset-0 bg-white/25"
											initial={{ scaleX: 0 }}
											animate={{ scaleX: 1 }}
											transition={{ duration: SLIDE_INTERVAL / 1000, ease: "linear" }}
											style={{ originX: 0, originY: 0.5 }}
										/>
									) : null}
									<span className="relative z-10">{slide.command}</span>
								</button>
							))}
						</div>
					</m.div>
					<m.div
						className="flex min-h-0 min-w-0 flex-1 flex-col"
						initial={{ opacity: 0, y: 20 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={REVEAL_VIEWPORT}
						transition={{ delay: 0.45, duration: 0.5, ease: "easeOut" }}
					>
						<div className="h-full min-w-0">
							<DiscordCommandAnimation activeSlide={activeSlide} />
						</div>
					</m.div>
				</div>
			</div>

			{/* 스크롤 유도 — 스크롤 시 페이드아웃(15% 지나면 visibility:hidden으로 클릭·포커스 차단), min-h 기반이라 모바일에도 유지.
			    pointer-events-none 래퍼(버튼만 auto)로 배경 히트 영역을 비우고, safe-area 여백은 아래 style에서 처리해요. */}
			<m.div
				className="pointer-events-none absolute inset-x-0 z-10 flex justify-center"
				style={{
					// 기본 1.5rem + iOS safe-area(env 값 0인 데스크탑은 기존과 동일), sm 이상 2rem + safe-area
					opacity: hintOpacity,
					visibility: hintHidden ? "hidden" : "visible",
					bottom: "calc(var(--hero-scroll-hint-gap) + env(safe-area-inset-bottom))"
				}}
			>
				<m.button
					type="button"
					onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}
					aria-label="아래로 스크롤해서 기능 보기"
					className="pointer-events-auto flex h-9 w-9 pointer-coarse:h-11 pointer-coarse:w-11 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors duration-fast hover:text-primary-text"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ delay: 1.2, duration: 0.6 }}
				>
					<m.span
						animate={{ y: [0, 6, 0] }}
						transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
						className="flex"
					>
						<ChevronDown size={18} aria-hidden />
					</m.span>
				</m.button>
			</m.div>
		</section>
	);
}