"use client";

import Image from "next/image";
import Link from "next/link";
import { Sparkles, ArrowRight, Play, Music, Zap, Users, Shield, DollarSign, ListMusicIcon } from "lucide-react";
import { motion } from "framer-motion";
import { DiscordPlaybackCard } from "@/components/discord-playback-card";
import { InteractiveGlow } from "@/components/interactive-glow";
import { TypingText } from "@/components/typing-text";

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

export default function Home() {
	return (
		<div className="w-full relative bg-background min-h-screen">
			<InteractiveGlow />
			
			<div className="relative">
				{/* Hero Section */}
				<section className="relative min-h-screen flex items-center">
					<div className="max-w-7xl mx-auto w-full px-6 lg:px-20 xl:px-6 2xl:px-0 relative">
						<div className="grid lg:grid-cols-[3fr_4fr] gap-8 lg:gap-12 xl:gap-24 items-center">
							{/* Left: Content */}
							<motion.div 
								className="space-y-8 flex flex-col items-center lg:items-start text-center lg:text-left"
								variants={containerVariants}
								initial="hidden"
								animate="visible"
							>
								<motion.div 
									variants={itemVariants}
									className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-bold backdrop-blur-md"
								>
									<Play size={14} fill="currentColor" />
									<span>끊김 없는 고품질 사운드</span>
								</motion.div>

								<motion.h1 
									variants={itemVariants}
									className="text-4xl sm:text-6xl lg:text-6xl xl:text-6xl [@media(max-height:800px)]:lg:text-5xl font-black tracking-tighter leading-[1.2] lg:leading-[1] text-foreground break-keep h-[3em] lg:h-auto"
								>
									<span className="text-title-gradient">시루봇과 함께</span>
									<br />
									<TypingText 
										texts={["더 즐거운", "심심할 틈 없는", "활기찬"]} 
										speed={100}
										// className="text-foreground text-4xl sm:text-5xl lg:text-4xl xl:text-5xl"
									/>
									<br />
									<span>서버를 만들어보세요.</span>
								</motion.h1>

								<motion.p 
									variants={itemVariants}
									className="text-lg sm:text-xl lg:text-lg xl:text-xl [@media(max-height:800px)]:lg:text-base font-medium text-muted-foreground/80 leading-relaxed max-w-2xl break-keep"
								>
									시루봇과 함께 디스코드에서 고품질 음악을 즐겨보세요.<br />
									간편한 명령어, 빠른 재생, 제한 없이 모든 기능을 사용해보세요.
								</motion.p>

								<motion.div 
									variants={itemVariants}
									className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-4 w-full sm:w-auto"
								>
									<Link 
										href="/invite" 
										className="group relative flex items-center justify-center gap-3 px-6 py-3 sm:px-10 sm:py-5 lg:px-8 lg:py-4 xl:px-10 xl:py-5 bg-gradient-to-r from-primary to-secondary text-white text-base lg:text-lg xl:text-xl font-bold rounded-2xl shadow-xl shadow-primary/20 hover:shadow-primary/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 overflow-hidden"
									>
										{/* Shimmer Effect */}
										<div className="absolute inset-0 w-[200%] h-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer-sweep -z-0 pointer-events-none" />
										
										<span className="relative z-10 flex items-center gap-3">
											디스코드에 추가하기
											<ArrowRight size={22} className="group-hover:translate-x-1 transition-transform" />
										</span>
									</Link>
									<Link 
										href="/servers" 
										className="px-6 py-3 sm:px-10 sm:py-5 lg:px-8 lg:py-4 xl:px-10 xl:py-5 glass-overlay text-foreground text-base lg:text-lg xl:text-xl font-bold rounded-2xl backdrop-blur-md hover:bg-white/10 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] text-center"
									>
										대시보드 보기
									</Link>
								</motion.div>

								<motion.div 
									variants={itemVariants}
									className="flex flex-wrap items-center justify-center lg:justify-start gap-6 sm:gap-12 pt-6 sm:pt-8"
								>
									{[
										{ value: "27K+", label: "서버" },
										{ value: "4K+", label: "사용자" },
										{ value: "24/7", label: "연중무휴" },
									].map((stat, i) => (
										<motion.div 
											key={i} 
											className="space-y-1 group cursor-default"
											whileHover={{ scale: 1.1 }}
											transition={{ type: "tween", stiffness: 400, damping: 10 }}
										>
											<div className="text-2xl sm:text-4xl font-black text-title-gradient">
												{stat.value}
											</div>
											<div className="text-xs sm:text-base text-muted-foreground font-bold tracking-tight">
												{stat.label}
											</div>
										</motion.div>
									))}
								</motion.div>
							</motion.div>

							{/* Right: Visual Area */}
							<div className="relative hidden lg:flex h-full items-center">
								{/* Card */}
								<motion.div 
									className="relative z-10 mb-8"
									initial={{ opacity: 0, scale: 0.9 }}
									animate={{ opacity: 1, scale: 1 }}
									transition={{ duration: 1, delay: 0.2 }}
								>
									<div className="relative group">
										<div className="rounded-2xl shadow-2xl overflow-visible">
											<DiscordPlaybackCard />
										</div>
										<div className="absolute -inset-10 bg-primary/20 rounded-full blur-[80px] -z-10 animate-pulse" />
									</div>
								</motion.div>

								{/* Character - 카드 위에 겹침 */}
								<div className="absolute right-0 bottom-0 top-10 h-full pointer-events-none">
									<motion.div
										className="h-full flex items-end justify-end"
										initial={{ opacity: 0, x: 30, y: 20 }}
										animate={{ opacity: 1, x: 0, y: 0 }}
										transition={{ duration: 1, delay: 0.2 }}
									>
										<Image 
											src="/images/siru-fullbody-sketch.png" 
											alt="Siru Character" 
											width={520}
											height={800}
											className="h-[110%] w-auto object-contain object-right-bottom drop-shadow-[0_0_80px_rgba(255,133,193,0.3)] opacity-70"
											priority
										/>
									</motion.div>
								</div>
							</div>
						</div>
					</div>

					{/* Scroll Down Indicator */}
					<motion.div 
						className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 text-muted-foreground/30"
						initial={{ opacity: 0, y: -20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: 2, duration: 1 }}
					>
						<motion.div
							animate={{ y: [0, 8, 0] }}
							transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
						>
							<ArrowRight size={20} className="rotate-90" />
						</motion.div>
					</motion.div>
				</section>

				{/* Features Section */}
				<section id="features" className="py-24 sm:py-32 px-6 relative flex items-center">
					<div className="max-w-7xl mx-auto space-y-16 sm:space-y-20">
						<motion.div 
							className="text-center space-y-6 sm:space-y-8"
							initial={{ opacity: 0, y: 40 }}
							whileInView={{ opacity: 1, y: 0 }}
							viewport={{ once: true, margin: "-100px" }}
							transition={{ duration: 0.8 }}
						>
							<div className="space-y-4">
								<h2 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tighter text-title-gradient">왜 시루봇인가요?</h2>
								<p className="text-lg sm:text-xl font-medium text-muted-foreground/80">수천 개의 서버가 선택한 이유를 확인해보세요</p>
							</div>
							
							<div className="flex justify-center">
								<Link 
									href="/invite" 
									className="inline-flex items-center gap-3 px-8 py-4 bg-primary/10 border border-primary/20 text-primary font-bold rounded-2xl hover:bg-primary/20 transition-all duration-300"
								>
									시루봇 추가하기
									<ArrowRight size={20} />
								</Link>
							</div>
						</motion.div>

						<div className="grid sm:grid-cols-4 lg:grid-cols-3 gap-6 sm:gap-4">
							{[
								{ icon: Music, title: "고품질 음악", desc: "고음질로 Spotify, YouTube 등 스트리밍을 지원해요.", gradient: "from-primary to-pink-400" },
								{ icon: Sparkles, title: "추천 곡 재생", desc: "노래를 직접 추가하지 않아도 추천 곡 재생이 가능해요.", gradient: "from-secondary to-yellow-500" },
								{ icon: ListMusicIcon, title: "나만의 재생목록", desc: "자주 듣는 곡들을 플레이리스트로 저장하고 언제든 다시 불러올 수 있어요.", gradient: "from-pink-500 to-rose-400" },
								{ icon: Users, title: "쉬운 사용", desc: "직관적인 명령어와 대시보드 버튼으로 누구나 쉽게 제어할 수 있어요.", gradient: "from-primary to-purple-500" },
								{ icon: Shield, title: "안정적 운영", desc: "24/7 가동으로 끊김 없는 서비스를 보장해요.", gradient: "from-secondary to-orange-500" },
								{ icon: DollarSign, title: "무료", desc: "대부분의 기능이 무료예요.", gradient: "from-secondary to-green-500" },
							].map((feature, i) => (
								<motion.div 
									key={i}
									className="group glass-panel p-8 space-y-6 hover:translate-y-[-8px] transition-all duration-300"
									initial={{ opacity: 0, scale: 0.9, y: 30 }}
									whileInView={{ opacity: 1, scale: 1, y: 0 }}
									viewport={{ once: true }}
									transition={{ duration: 0.5, delay: i * 0.1 }}
								>
									<div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center text-white shadow-lg`}>
										<feature.icon size={26} />
									</div>
									<div className="space-y-3">
										<h3 className="text-xl sm:text-2xl font-black tracking-tighter text-foreground">{feature.title}</h3>
										<p className="text-muted-foreground/70 font-medium leading-relaxed">{feature.desc}</p>
									</div>
								</motion.div>
							))}
						</div>
					</div>
				</section>
			</div>
		</div>
	);
}
