"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, m, useInView, useReducedMotion } from "framer-motion";
import { ArrowRight, LayoutDashboard } from "lucide-react";

import { DiscordCommandAnimation, slideConfigs } from "@/components/home/discord-command-animation";
import { SectionLabel } from "@/components/primitives/section-label";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// 헤드라인 회전 단어 — "음악부터 AI까지, ___ 시루봇 하나면 돼요"의 빈칸에 아래에서 위로 밀려 올라와 교체돼요
const ROTATING_WORDS = ['서버에 필요한 모든 걸', 'Discord 안에서, 웹에서', '게임부터 서버 꾸미기까지'] as const;
const ROTATE_INTERVAL_MS = 2600;

/**
 * 헤드라인 단어 회전기 — 현재 단어가 위로 빠지면서 다음 단어가 아래에서 올라와요.
 * 폭 sizer는 "교체 대상(다음) 단어" 기준으로 즉시 전환해요: 이전 단어 폭을 유지하면
 * 더 긴 단어가 진입하는 동안 overflow-hidden에 잘려요.
 * 마스크 하단 패딩은 자모 받침 클리핑 방지용이에요.
 */
function WordRotator() {
	const [index, setIndex] = useState(0);

	useEffect(() => {
		const timer = setInterval(() => setIndex((prev) => (prev + 1) % ROTATING_WORDS.length), ROTATE_INTERVAL_MS);
		return () => clearInterval(timer);
	}, []);

	return (
		<span className="relative inline-block overflow-hidden whitespace-pre pb-[0.12em] -mb-[0.12em] align-bottom">
			<span className="invisible" aria-hidden>
				{ROTATING_WORDS[index]}
			</span>
			<AnimatePresence initial={false}>
				<m.span
					key={ROTATING_WORDS[index]}
					className="absolute inset-0 flex justify-center lg:justify-start"
					initial={{ y: "110%", opacity: 0 }}
					animate={{ y: "0%", opacity: 1 }}
					exit={{ y: "-110%", opacity: 0 }}
					transition={{ type: "spring", stiffness: 260, damping: 32 }}
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
	const shouldReduce = useReducedMotion();

	// 히어로가 보이기 시작하면 데모 슬라이드 자동 재생을 시작해요.
	const heroInView = useInView(heroRef, { once: true, amount: 0.2 });

	// 한 예시(타이핑 → 전송 → 응답)가 끝나면 다음 예시로 넘겨요. 직접 고른 뒤에는 멈춰요.
	const handleDone = () => {
		if (autoPlay) setActiveSlide((prev) => (prev + 1) % slideConfigs.length);
	};

	const handleSlideChange = (index: number) => {
		setAutoPlay(false);
		setActiveSlide(index);
	};

	return (
		<section ref={heroRef} id="hero-section" className="relative overflow-hidden">
			<div className="relative mx-auto grid lg:min-h-[calc(100svh-var(--navbar-h))] w-full max-w-7xl content-center gap-10 px-4 pb-14 pt-4 sm:px-6 sm:pb-16 sm:pt-8 lg:grid-cols-[minmax(0,0.9fr)_auto] lg:items-center lg:gap-14 lg:px-8 lg:pb-20 lg:pt-10">
				<div className="flex min-w-0 flex-col items-center gap-7 text-center lg:items-start lg:text-left">
					<h1 className="text-3xl font-black leading-tight tracking-tighter text-foreground break-keep sm:text-5xl xl:text-6xl">
						음악부터 AI까지,
						<br />
						<span className="text-primary-text">{shouldReduce ? ROTATING_WORDS[0] : <WordRotator />}</span>
						<br />
						시루봇 하나면 돼요
					</h1>

					<p
						className="max-w-xl text-base font-medium leading-relaxed text-muted-foreground break-keep sm:text-lg lg:mx-0"
					>
						음악 재생부터 AI 채팅, 서버 관리까지.{" "}
						<br className="hidden sm:block" />
						시루봇 하나로 Discord를 더 편리하게 즐겨보세요.
					</p>

					<div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row lg:justify-start">
						<Link href="/invite" className={cn(buttonVariants({ variant: "cta", size: "xl" }), "group w-full text-base sm:w-auto")}>
							지금 초대하기
							<ArrowRight size={17} aria-hidden className="transition-transform duration-fast group-hover:translate-x-0.5" />
						</Link>
						<Link href="/servers" className={cn(buttonVariants({ variant: "secondary", size: "xl" }), "w-full text-base sm:w-auto")}>
							<LayoutDashboard size={17} aria-hidden />
							대시보드 시작하기
						</Link>
					</div>
				</div>

				{/* 우측 목업 컬럼 — self-stretch으로 그리드 행 높이를 가득 채우고, xl 이상에서 폭도 넓혀 대형 헤드라인과 균형을 맞춰요 */}
				<div className="flex min-w-0 flex-col gap-4 lg:w-[500px] lg:self-stretch lg:justify-self-end xl:w-[560px]">
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
										"cursor-pointer rounded-control border-0 min-h-11 px-3 py-2 sm:min-h-0 sm:py-1.5 text-xs font-bold transition-colors duration-fast",
										activeSlide === index
											? "bg-primary-control text-primary-control-text"
											: "bg-surface-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground",
									)}
								>
									{slide.command}
								</button>
							))}
						</div>
					</div>
					<div
						className="flex min-h-0 min-w-0 flex-1 flex-col"
					>
						<div className="h-full min-w-0">
							<DiscordCommandAnimation activeSlide={activeSlide} active={heroInView} onDone={handleDone} />
						</div>
					</div>
				</div>
			</div>

		</section>
	);
}