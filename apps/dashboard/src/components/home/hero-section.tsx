"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { m, type MotionValue, useInView, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, ChevronDown, LayoutDashboard } from "lucide-react";

import { DiscordCommandAnimation, slideConfigs } from "@/components/home/discord-command-animation";
import { buttonVariants } from "@/components/primitives/button";
import { SectionLabel } from "@/components/primitives/section-label";
import { TypingText } from "@/components/typing-text";
import { useCountUp } from "@/hooks/use-count-up";
import { cn } from "@/lib/utils";

const SLIDE_INTERVAL = 7000;
const TYPING_TEXTS = ['더 즐거운 서버를', '심심할 틈 없는 서버를', '활기찬 서버를'];
const TYPING_SPEED = 90;
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
 * 헤드라인 전용 리빌 체계 — 정적 단어들은 blur + 떠오름으로 개별 등장(텍스트 리빌),
 * TypingText 세그먼트는 variants로 한 덩어리 등장시켜 내부 타이핑 로직은 그대로 유지해요.
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

/** 타이핑 세그먼트 등장 — 워드 리빌 스태거 끝에 자연스럽게 붙도록 스프링 파라미터를 맞췄어요 */
const headlineTypingVariants = {
	hidden: { opacity: 0, y: 14 },
	visible: {
		opacity: 1,
		y: 0,
		transition: { type: "spring", stiffness: 120, damping: 20 }
	},
} as const;

/** hero 배경 — 브랜드 도트 그리드 패턴(마스크로 가장자리 페이드). y가 주어지면 스크롤 패럴랙스 */
function DotPattern({ y }: { y?: MotionValue<number> }) {
	return (
		<m.div style={{ y }} className="pointer-events-none absolute inset-0 -z-10">
			<svg aria-hidden className="h-full w-full [mask-image:radial-gradient(ellipse_60%_70%_at_50%_35%,black,transparent)]">
				<defs>
					<pattern id="hero-dots" width="24" height="24" patternUnits="userSpaceOnUse">
						<circle cx="2" cy="2" r="1.2" className="fill-primary/10" />
					</pattern>
				</defs>
				<rect width="100%" height="100%" fill="url(#hero-dots)" />
			</svg>
		</m.div>
	);
}

export function HeroSection() {
	const [activeSlide, setActiveSlide] = useState(0);
	const [autoPlay, setAutoPlay] = useState(true);
	const heroRef = useRef<HTMLElement>(null);

	// 도트 패턴 스크롤 패럴랙스 — 섹션이 화면 위로 빠질 때까지 배경이 콘텐츠보다 천천히 따라와요.
	// 성능: transform(y)만 사용해 렌더 비용을 최소화하고, reduced-motion 환경에선 정적 배경 유지.
	const shouldReduce = useReducedMotion();
	const { scrollYProgress } = useScroll({
		target: heroRef,
		offset: ["start start", "end start"]
	});
	const dotY = useTransform(scrollYProgress, [0, 1], [0, 120]);

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
			{/* 패럴랙스는 reduced-motion 환경에선 걸지 않고 정적 배경 유지 */}
			<DotPattern y={shouldReduce ? undefined : dotY} />
			<div className="relative mx-auto grid min-h-[calc(100svh-4rem)] w-full max-w-7xl content-center gap-10 px-4 pb-14 pt-24 sm:px-6 sm:pb-16 sm:pt-32 lg:grid-cols-[minmax(0,0.9fr)_auto] lg:items-center lg:gap-14 lg:px-8 lg:pb-20 lg:pt-36">
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
							// 접근성 폴백 — reduced-motion 환경에선 단어 분해 없이 기존 단순 등장 유지
							<>
								시루봇과 함께
								<br />
								<span className="text-primary-text">
									<TypingText texts={TYPING_TEXTS} speed={TYPING_SPEED} fit />
								</span>{" "}
								만들어봐요
							</>
						) : (
							<>
								{SPLIT_HEADLINE_TOP.map((word) => (
									<m.span key={word} className="inline-block whitespace-pre" variants={headlineWordVariants}>
										{word}
									</m.span>
								))}
								<br />
								<m.span className="inline-block whitespace-pre text-primary-text" variants={headlineTypingVariants}>
									<TypingText texts={TYPING_TEXTS} speed={TYPING_SPEED} fit />
								</m.span>{" "}
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
						className="grid w-full grid-cols-3 gap-4 border-t border-border-subtle pt-5 sm:max-w-lg lg:max-w-none"
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
						<div>
							<dt className="text-xs font-medium text-muted-foreground">이용 중인 서버</dt>
							<dd className="mt-1 text-lg font-black tracking-tighter text-foreground sm:text-xl">
								{/* 실측 불가한 이전 "28K+" 통계 제거(R-17). 실제 서버 수는 로그인 후 /shards에서 확인 가능 */}
								<span>서버 상태에서 확인</span>
							</dd>
						</div>
					</m.dl>
				</m.div>

				<div className="min-w-0 space-y-3 lg:w-[500px] lg:justify-self-end">
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
										"relative cursor-pointer overflow-hidden rounded-control border px-3 py-1.5 text-xs font-bold transition-colors duration-fast",
										activeSlide === index
											? "border-primary-control bg-primary-control text-primary-foreground"
											: "border-border bg-surface-1 text-foreground/70 hover:bg-surface-2 hover:text-foreground",
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
						className="flex flex-col-reverse gap-3 lg:flex-row"
						initial={{ opacity: 0, y: 20 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={REVEAL_VIEWPORT}
						transition={{ delay: 0.45, duration: 0.5, ease: "easeOut" }}
					>
						<div className="min-w-0 flex-1">
							<DiscordCommandAnimation activeSlide={activeSlide} />
						</div>
					</m.div>
				</div>
			</div>

			{/* 스크롤 유도 — 아래로 살짝 내리면 기능 섹션이에요 */}
			{/* 히어로가 h-screen 고정이 아닌 min-h(calc(100svh-4rem)) 기반이라 콘텐츠와 겹칠 일이 드물어
			    모바일에서도 버튼을 유지한다. 대신 홈 인디케이터(홈바) 기기를 위해 bottom 여백에
			    safe-area를 더하고(--hero-scroll-hint-gap: 1.5rem, sm 이상 2rem), 아주 낮은 높이의
			    가로 모드 등에선 콘텐츠 아래쪽과 붙지 않도록 gap 변수가 여유를 가진다 */}
			{/* 스크롤 유도 래퍼 — 내려가면 opacity를 useTransform으로 페이드아웃(리렌더 없음)하고,
			    15%를 넘으면 visibility:hidden 토글로 버튼 클릭·포커스를 완전히 차단해요.
			    래퍼에 pointer-events-none을 두고 버튼에만 다시 허용해 배경 히트 영역은 비워둬요 */}
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
					className="pointer-events-auto flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors duration-fast hover:text-primary-text"
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