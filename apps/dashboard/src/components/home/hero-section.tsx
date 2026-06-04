"use client";

import { useState } from "react";
import Link from "next/link";
import { m } from "framer-motion";
import { ArrowRight, Play } from "lucide-react";

import {
	DiscordCommandAnimation,
	slideConfigs,
} from "@/components/home/discord-command-animation";
import { TypingText } from "@/components/typing-text";

const TOTAL_SLIDES = slideConfigs.length;

const containerVariants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: {
			staggerChildren: 0.15,
			delayChildren: 0.2,
		},
	},
} as const;

const itemVariants = {
	hidden: { opacity: 0, y: 30 },
	visible: {
		opacity: 1,
		y: 0,
		transition: {
			type: "spring",
			stiffness: 100,
			damping: 20,
		},
	},
} as const;

export function HeroSection() {
	const [activeSlide, setActiveSlide] = useState(0);

	const handleAnimationComplete = () => {
		setActiveSlide((prev) => (prev + 1) % TOTAL_SLIDES);
	};

	return (
		<section
			id="hero-section"
			className="relative min-h-dvh flex items-center overflow-hidden py-12 lg:py-0"
		>
			<div className="relative w-full flex items-center overflow-x-clip">
				{/* Background Character - removed to attach to discord card */}
				<div className="absolute right-[5%] bottom-[15%] w-[350px] h-[450px] bg-primary/10 rounded-full blur-[150px] pointer-events-none" />

				<div className="relative mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 z-10">
					<div className="flex flex-col lg:flex-row gap-8 lg:gap-10 xl:gap-16 items-center w-full">
						{/* Left: Content */}
						<m.div
							className="flex-[2] space-y-8 flex flex-col items-center lg:items-start text-center lg:text-left w-full min-w-0"
							variants={containerVariants}
							initial="hidden"
							animate="visible"
						>
							<m.div
								variants={itemVariants}
								className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-bold backdrop-blur-md"
							>
								<Play size={14} fill="currentColor" />
								<span>끊김 없는 고품질 사운드</span>
								<div className="absolute -inset-10 bg-secondary/20 rounded-full blur-[80px] -z-10" />
							</m.div>

							<m.h1
								variants={itemVariants}
								className="text-4xl sm:text-6xl lg:text-6xl xl:text-6xl [@media(max-height:800px)]:lg:text-5xl font-black tracking-tighter leading-[1.2] lg:leading-[1] text-foreground break-keep h-[3em] lg:h-auto"
							>
								<span className="text-title-gradient">
									시루봇과 함께
								</span>
								<br />
								<TypingText
									texts={[
										"더 즐거운",
										"심심할 틈 없는",
										"활기찬",
									]}
									speed={100}
								/>
								<br />
								<span>서버를 만들어봐요!</span>
							</m.h1>

							<m.p
								variants={itemVariants}
								className="text-lg sm:text-xl lg:text-lg xl:text-xl [@media(max-height:800px)]:lg:text-base font-medium text-muted-foreground/80 leading-relaxed max-w-2xl break-keep"
							>
								시루봇으로 고품질 음악을 들어보세요.
								<br />
								간편한 명령어와 빠른 재생으로 모든 기능을
								즐겨봐요.
							</m.p>

							<m.div
								variants={itemVariants}
								className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-4 w-full sm:w-auto"
							>
								<Link
									href="/invite"
									className="group relative flex items-center justify-center gap-3 px-4 py-3 sm:px-6 sm:py-4 lg:px-8 lg:py-4 xl:px-10 xl:py-5 bg-gradient-to-r from-primary to-secondary text-white text-base lg:text-lg xl:text-xl font-bold rounded-2xl shadow-xl shadow-primary/20 hover:shadow-primary/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 overflow-hidden whitespace-nowrap"
								>
									<div className="absolute inset-0 w-[200%] h-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer-sweep -z-0 pointer-events-none" />
									<span className="relative z-10 flex items-center gap-3">
										지금 초대하기
										<ArrowRight
											size={22}
											className="group-hover:translate-x-1 transition-transform"
										/>
									</span>
								</Link>
								<Link
									href="/servers"
									className="px-4 py-3 sm:px-6 sm:py-4 lg:px-8 lg:py-4 xl:px-10 xl:py-5 glass-overlay text-foreground text-base lg:text-lg xl:text-xl font-bold rounded-2xl backdrop-blur-md hover:bg-foreground/5 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] text-center whitespace-nowrap"
								>
									대시보드 시작하기
								</Link>
							</m.div>

							{/* Stats */}
							<m.div
								variants={itemVariants}
								className="flex flex-wrap items-center justify-center lg:justify-start gap-6 sm:gap-12 pt-6 sm:pt-8"
							>
								{[
									{ value: "27K+", label: "서버" },
									{ value: "4K+", label: "사용자" },
								].map((stat, i) => (
									<m.div
										key={i}
										className="space-y-1 group cursor-default"
										whileHover={{ scale: 1.1 }}
										transition={{
											type: "tween",
											stiffness: 400,
											damping: 10,
										}}
									>
										<div className="text-2xl sm:text-4xl font-black text-title-gradient">
											{stat.value}
										</div>
										<div className="text-xs sm:text-base text-muted-foreground font-bold tracking-tight">
											{stat.label}
										</div>
									</m.div>
								))}
							</m.div>

						</m.div>

						{/* Right: Discord Chat — 스크롤에 따라 명령어 변경 */}
						<div className="relative hidden lg:flex flex-col flex-[3] w-full max-w-[760px] h-[520px] items-center justify-center gap-6">
							{/* Animation step indicator */}
							<m.div
								className="flex items-center gap-3 w-full px-2 relative z-20"
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.5, delay: 0.3 }}
							>
								{slideConfigs.map((slide, i) => (
									<div
										key={i}
										className="flex items-center gap-2"
									>
										<button
											onClick={() => setActiveSlide(i)}
											className={`h-1.5 rounded-full transition-all duration-300 ${i === activeSlide
												? "w-8 bg-primary"
												: i < activeSlide
													? "w-3 bg-primary/40"
													: "w-3 bg-muted-foreground/20 hover:bg-muted-foreground/45"
												}`}
										/>
										{i === activeSlide && (
											<m.span
												initial={{ opacity: 0, x: -5 }}
												animate={{ opacity: 1, x: 0 }}
												className="text-xs font-bold text-primary"
											>
												{slide.command}
											</m.span>
										)}
									</div>
								))}
							</m.div>

							<m.div
								className="relative z-10 w-full"
								initial={{ opacity: 0, scale: 0.9 }}
								animate={{ opacity: 1, scale: 1 }}
								transition={{ duration: 1, delay: 0.2 }}
							>
								<div className="relative group w-full mx-auto">
									<div className="rounded-2xl shadow-2xl overflow-visible relative z-10">
										<DiscordCommandAnimation
											activeSlide={activeSlide}
											onComplete={handleAnimationComplete}
										/>
									</div>
									<div className="absolute -inset-10 bg-primary/20 rounded-full blur-[80px] -z-10 pointer-events-none" />
								</div>
							</m.div>
						</div>
					</div>
				</div>

				{/* Scroll Down Indicator */}
				<m.div
					className="absolute -bottom-2 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 text-muted-foreground/30"
					initial={{ opacity: 0, y: -20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 2, duration: 1 }}
				>
					<m.div
						animate={{ y: [0, 8, 0] }}
						transition={{
							duration: 2,
							repeat: Infinity,
							ease: "easeInOut",
						}}
					>
						<ArrowRight size={20} className="rotate-90" />
					</m.div>
				</m.div>
			</div>
		</section>
	);
}
