"use client";

import Link from "next/link";
import { Home, ChevronLeft, Search } from "lucide-react";
import { InteractiveGlow } from "@/components/interactive-glow";

export default function NotFound() {
	return (
		<main className="relative flex h-[100vh] w-full items-center justify-center overflow-hidden px-4">
			{/* Dynamic Background Effect */}
			<InteractiveGlow />

			<div className="relative z-10 flex flex-col items-center text-center">
				{/* Immersive 404 Background Text */}
				<div className="absolute inset-0 -z-10 flex items-center justify-center">
					<span className="text-[20rem] font-black text-primary/5 select-none md:text-[30rem]">
						404
					</span>
				</div>

				<div className="space-y-8">
					<div className="flex flex-col items-center space-y-4">
						<div className="relative flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-tr from-primary/20 via-primary/5 to-secondary/10 p-6 shadow-[0_0_50px_-10px_rgba(255,133,193,0.3)]">
							<Search className="h-12 w-12 text-primary animate-pulse" />
						</div>

						<h1 className="text-title-gradient text-5xl font-extrabold tracking-tighter md:text-7xl">
							길을 잃으셨나요?
						</h1>
					</div>

					<div className="min-h-[4rem]">
						<span
							className="text-lg font-medium leading-relaxed text-muted-foreground/80 md:text-xl"
						>
							이 페이지는 존재하지 않아요.
							</span>
					</div>

					<div className="flex flex-col items-center gap-6 pt-8">
						<Link
							href="/"
							className="group relative flex items-center gap-3 overflow-hidden rounded-full bg-primary px-10 py-5 text-lg font-bold text-white shadow-[0_20px_40px_-15px_rgba(255,133,193,0.5)] transition-all duration-300 hover:scale-105 hover:bg-primary/90 active:scale-95"
						>
							<div className="absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-[100%]" />
							<Home className="h-6 w-6" />
							메인 페이지로 돌아가기
						</Link>

						<button 
							onClick={() => window.history.back()}
							className="group flex items-center gap-2 text-base font-semibold text-muted-foreground/60 transition-all hover:text-primary"
						>
							<ChevronLeft className="h-5 w-5 transition-transform group-hover:-translate-x-1" />
							이전 페이지로 돌아가기
						</button>
					</div>
				</div>
			</div>
		</main>
	);
}

