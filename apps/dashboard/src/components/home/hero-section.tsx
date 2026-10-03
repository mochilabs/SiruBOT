"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { m } from "framer-motion";
import { ArrowRight, LayoutDashboard } from "lucide-react";

import { DiscordCommandAnimation, slideConfigs } from "@/components/home/discord-command-animation";
import { buttonVariants } from "@/components/primitives/button";
import { SectionLabel } from "@/components/primitives/section-label";
import { TypingText } from "@/components/typing-text";
import { cn } from "@/lib/utils";

const containerVariants = {
	hidden: { opacity: 0 },
	visible: { opacity: 1, transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
} as const;

const itemVariants = {
	hidden: { opacity: 0, y: 24 },
	visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 90, damping: 18 } },
} as const;

/** hero 배경 — 브랜드 도트 그리드 패턴(마스크로 가장자리 페이드) */
function DotPattern() {
	return (
		<svg aria-hidden className="pointer-events-none absolute inset-0 -z-10 h-full w-full [mask-image:radial-gradient(ellipse_60%_70%_at_50%_35%,black,transparent)]">
			<defs>
				<pattern id="hero-dots" width="24" height="24" patternUnits="userSpaceOnUse">
					<circle cx="2" cy="2" r="1.2" className="fill-primary/10" />
				</pattern>
			</defs>
			<rect width="100%" height="100%" fill="url(#hero-dots)" />
		</svg>
	);
}

export function HeroSection() {
	const [activeSlide, setActiveSlide] = useState(0);
	const [autoPlay, setAutoPlay] = useState(true);
	const [heroInView, setHeroInView] = useState(false);
	const reducedMotion = useRef(false);

	useEffect(() => {
		reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	}, []);

	useEffect(() => {
		const el = document.getElementById("hero-section");
		if (!el) return undefined;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) setHeroInView(true);
			},
			{ threshold: 0.2 },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		if (!autoPlay || !heroInView || reducedMotion.current) return undefined;
		const timer = setInterval(() => setActiveSlide((prev) => (prev + 1) % slideConfigs.length), 7000);
		return () => clearInterval(timer);
	}, [autoPlay, heroInView]);

	const handleSlideChange = (index: number) => {
		setAutoPlay(false);
		setActiveSlide(index);
	};

	return (
		<section id="hero-section" className="relative overflow-hidden border-b border-border-subtle">
			<DotPattern />
			<div className="relative mx-auto grid w-full max-w-7xl gap-10 px-4 pt-28 pb-12 sm:px-6 sm:pt-32 sm:pb-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-12 lg:px-8 lg:pt-36 lg:pb-20">
				<m.div
					className="flex min-w-0 flex-col items-center gap-7 text-center lg:items-start lg:text-left"
					variants={containerVariants}
					initial="hidden"
					whileInView="visible"
					viewport={{ once: true, margin: "-60px" }}
				>
				<m.h1
					variants={itemVariants}
					className="text-4xl font-black leading-tight tracking-tighter text-foreground break-keep sm:text-5xl lg:text-6xl"
				>
					시루봇과 함께
					<br />
					<span className="text-primary">
						<TypingText texts={["더 즐거운 서버를", "심심할 틈 없는 서버를", "활기찬 서버를"]} speed={90} fit />
					</span>{" "}
					만들어봐요
				</m.h1>

					<m.p
						variants={itemVariants}
						className="max-w-xl text-base font-medium leading-relaxed text-muted-foreground/80 break-keep sm:text-lg lg:mx-0"
					>
						채널에서 음악을 재생하고, 궁금한 건 물어보고, 서버 설정은 웹에서 손보는 Discord 봇이에요.
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
							<dd className="mt-1 text-lg font-black tracking-tighter text-foreground sm:text-xl">45개</dd>
						</div>
						<div>
							<dt className="text-xs font-medium text-muted-foreground">음원 플랫폼</dt>
							<dd className="mt-1 text-lg font-black tracking-tighter text-foreground sm:text-xl">3종</dd>
						</div>
					<div>
						<dt className="text-xs font-medium text-muted-foreground">이용 중인 서버</dt>
						<dd className="mt-1 text-lg font-black tracking-tighter text-foreground sm:text-xl">28K+</dd>
					</div>
					</m.dl>
				</m.div>

			<div className="min-w-0 space-y-3 lg:max-w-xl lg:justify-self-end">
				<m.div
					className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
					initial={{ opacity: 0, y: 12 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true, margin: "-60px" }}
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
									"cursor-pointer rounded-control border px-3 py-1.5 text-xs font-bold transition-colors duration-fast",
									activeSlide === index
										? "border-primary bg-primary text-primary-foreground"
										: "border-border bg-surface-1 text-foreground/70 hover:bg-surface-2 hover:text-foreground",
								)}
							>
								{slide.command}
							</button>
						))}
					</div>
				</m.div>
				<m.div
					className="flex flex-col-reverse gap-3 lg:flex-row"
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true, margin: "-60px" }}
					transition={{ delay: 0.45, duration: 0.5, ease: "easeOut" }}
				>
					<div className="flex items-center justify-center gap-1.5 py-2 lg:flex-col lg:py-4" role="tablist" aria-label="예시 위치">
						{slideConfigs.map((slide, index) => (
							<button
								key={slide.command}
								type="button"
								role="tab"
								aria-selected={activeSlide === index}
								onClick={() => handleSlideChange(index)}
								className="group flex h-5 w-5 cursor-pointer items-center justify-center"
							>
								<span
									className={cn(
										"rounded-full transition-all duration-base",
										activeSlide === index ? "h-2.5 w-2.5 bg-primary" : "h-1.5 w-1.5 bg-border group-hover:bg-muted-foreground/50",
									)}
								/>
							</button>
						))}
					</div>
					<div className="min-w-0 flex-1">
						<DiscordCommandAnimation activeSlide={activeSlide} />
					</div>
				</m.div>
			</div>
			</div>
		</section>
	);
}