"use client";

import { useEffect,useState } from "react";
import Link from "next/link";
import { ExternalLink, Home, Loader2,UserPlus } from "lucide-react";

import { InteractiveGlow } from "@/components/interactive-glow";
import { buildInviteUrl } from "@/utils";

export default function InvitePage() {
	const inviteUrl = buildInviteUrl({ redirect_url: process.env.NEXT_PUBLIC_APP_URL + "/invite/redirect" });
	const [count, setCount] = useState(5);

	useEffect(() => {
		if (count <= 0) {
			window.location.href = inviteUrl;
			return;
		}

		const timer = setInterval(() => {
			setCount((prev) => prev - 1);
		}, 1000);

		return () => clearInterval(timer);
	}, [count, inviteUrl]);

	return (
		<main className="relative flex h-[100vh] w-full items-center justify-center overflow-hidden px-4">
			{/* Dynamic Background Effect */}
			<InteractiveGlow />

			<div className="relative z-10 flex flex-col items-center text-center">
				{/* Immersive Background Text - Optimized for Mobile */}
				<div className="absolute inset-0 -z-10 flex items-center justify-center">
					<span className="text-[10rem] sm:text-[18rem] md:text-[28rem] font-black text-primary/5 select-none tracking-tighter uppercase whitespace-nowrap">
						초대하기
					</span>
				</div>

				<div className="space-y-8">
					<div className="flex flex-col items-center space-y-4">
						<div className="relative flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-tr from-primary/20 via-primary/5 to-secondary/10 p-6 shadow-[0_0_50px_-10px_rgba(255,133,193,0.3)]">
							<UserPlus className="h-12 w-12 text-primary" />
						</div>

						<div className="space-y-2">
							<h1 className="text-title-gradient text-5xl font-extrabold tracking-tighter md:text-7xl">
								시루봇과 함께해요
							</h1>
							<div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-overlay text-xs font-bold text-muted-foreground/60 w-[200px] justify-center tabular-nums">
								<Loader2 size={12} className="animate-spin" />
								<span>{count}초 뒤에 자동으로 이동할게요...</span>
							</div>
						</div>
					</div>

					<div className="max-w-md mx-auto mb-0">
						<p className="text-lg font-medium leading-relaxed text-muted-foreground/80 md:text-xl break-keep">
							최고의 음악 경험을 전하는 시루봇을 초대해보세요.
						</p>
					</div>

					<div className="flex flex-col items-center gap-6 pt-8">
						<a
							href={inviteUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="group relative flex items-center gap-4 overflow-hidden rounded-full bg-primary px-10 py-5 text-xl font-bold text-white shadow-[0_20px_40px_-15px_rgba(255,133,193,0.5)] transition-all duration-300 hover:scale-105 hover:bg-primary/90 active:scale-95"
						>
							<div className="absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-[100%]" />
							<UserPlus className="h-6 w-6" />
							초대하기
							<ExternalLink className="h-5 w-5 opacity-40 group-hover:opacity-100 transition-opacity" />
						</a>

						<Link 
							href="/"
							className="group flex items-center gap-2 text-base font-semibold text-muted-foreground/60 transition-all hover:text-primary"
						>
							<Home className="h-5 w-5" />
							홈으로 가기
						</Link>
					</div>
				</div>
			</div>
		</main>
	);
}
