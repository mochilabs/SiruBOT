"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useInView, useReducedMotion } from "framer-motion";
import { ArrowRight, LayoutDashboard } from "lucide-react";

import { DiscordCommandAnimation, slideConfigs } from "@/components/home/discord-command-animation";
import { HeroBackdrop } from "@/components/home/hero-backdrop";
import { ROTATING_WORDS, WordRotator } from "@/components/home/word-rotator";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function HeroSection() {
	const [activeSlide, setActiveSlide] = useState(0);
	const heroRef = useRef<HTMLElement>(null);
	const shouldReduce = useReducedMotion();

	// 히어로가 보이기 시작하면 데모를 재생해요.
	const heroInView = useInView(heroRef, { once: true, amount: 0.2 });

	// 한 예시(커서 → 타이핑 → 전송 → 응답 → 버튼 클릭)가 끝나면 다음 예시로 넘어가요.
	// 칩을 직접 눌러도 그 예시부터 이어서 순환해요.
	const handleDone = () => setActiveSlide((prev) => (prev + 1) % slideConfigs.length);

	return (
		<section ref={heroRef} id="hero-section" className="relative overflow-hidden">
			<HeroBackdrop />
			{/* 화면 높이를 억지로 채우지 않아요: 내용 높이 + 여백만 두고, 두 컬럼은 세로 중앙 정렬 */}
			<div className="relative mx-auto grid w-full max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:gap-20 lg:px-8 lg:py-24 xl:grid-cols-[minmax(0,1fr)_minmax(0,32rem)]">
				<div className="flex min-w-0 flex-col items-center gap-6 text-center lg:items-start lg:text-left">
					<h1 className="text-3xl font-black leading-tight tracking-tighter text-foreground break-keep sm:text-5xl xl:text-6xl">
						음악부터 AI까지,
						<br />
						<span className="text-primary-text">{shouldReduce ? ROTATING_WORDS[0] : <WordRotator />}</span>
						<br />
						시루봇 하나면 돼요
					</h1>

					<p className="max-w-xl text-base font-medium leading-relaxed text-muted-foreground break-keep sm:text-lg">
						명령어는 Discord에서, 설정은 웹 대시보드에서.
						<br className="hidden sm:block" /> 서버에 맞게 골라 쓰는 음악·AI 봇이에요.
					</p>

					<div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
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

				{/* 데모 컬럼 — 카드가 헤드라인과 같은 높이에서 시작하고, 예시 탭은 카드 아래에 붙어요 */}
				<div className="flex min-w-0 flex-col gap-3">
					<DiscordCommandAnimation activeSlide={activeSlide} active={heroInView} onDone={handleDone} />
					<div role="tablist" aria-label="Discord 명령어 예시" className="flex flex-wrap items-center gap-1">
						{slideConfigs.map((slide, index) => (
							<button
								key={slide.command}
								type="button"
								role="tab"
								aria-selected={activeSlide === index}
								onClick={() => setActiveSlide(index)}
								className={cn(
									"min-h-11 cursor-pointer rounded-control px-3 py-2 text-xs font-bold transition-colors duration-fast sm:min-h-0 sm:py-1.5",
									activeSlide === index
										? "bg-primary/10 text-primary-text"
										: "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
								)}
							>
								{slide.command}
							</button>
						))}
					</div>
				</div>
			</div>
		</section>
	);
}
