

import Link from "next/link";
import { ChevronLeft, LogIn, Sparkles } from "lucide-react";
import { InteractiveGlow } from "@/components/interactive-glow";
import { TypingText } from "@/components/typing-text";
import { signIn } from "@/lib/auth";

interface LoginPageProps {
	searchParams: Promise<{ callbackUrl?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
	const { callbackUrl } = await searchParams;
	const redirectTarget = callbackUrl || "/servers";

	return (
		<main className="relative flex min-h-[100vh] w-full items-center justify-center overflow-hidden px-4">
			{/* Dynamic Background Effect */}
			<InteractiveGlow />

			<div className="relative z-10 flex flex-col items-center text-center">
				{/* Immersive Background Text */}
				<div className="absolute inset-0 -z-10 flex items-center justify-center">
					<span className="text-[12rem] sm:text-[20rem] md:text-[30rem] font-black text-primary/5 select-none tracking-tighter uppercase">
						LOGIN
					</span>
				</div>

				<div className="space-y-12">
					<div className="flex flex-col items-center space-y-6">
						{/* Hero Symbol */}
						<div className="relative flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-tr from-[#5865F2]/20 via-[#5865F2]/5 to-secondary/10 p-6 shadow-[0_0_50px_-10px_rgba(88,101,242,0.3)]">
							<LogIn className="h-12 w-12 text-[#5865F2] animate-pulse-soft" />
							<div className="absolute -top-2 -right-2 bg-primary text-white p-2 rounded-full shadow-lg">
								<Sparkles size={16} />
							</div>
						</div>

						<div className="space-y-4">
							<h1 className="text-title-gradient text-5xl font-extrabold tracking-tighter md:text-7xl">
								시루봇 대시보드에<br />오신 걸 환영해요!
							</h1>
							<div className="min-h-[1.5rem]">
								<TypingText 
									texts={[
										"디스코드 계정으로 간편하게 시작해 볼까요?",
										"시루봇의 모든 기능을 자유롭게 써보세요."
									]}
									className="text-lg font-medium text-muted-foreground/80 md:text-xl"
									speed={60}
								/>
							</div>
						</div>
					</div>

					<div className="flex flex-col items-center gap-8 pt-4">
						<form
							action={async () => {
								"use server";
								await signIn("discord", { redirectTo: redirectTarget });
							}}
							className="w-full"
						>
							<button
								type="submit"
								className="group relative flex w-full max-w-sm mx-auto items-center justify-center gap-4 overflow-hidden rounded-full bg-[#5865F2] px-10 py-5 text-xl font-black text-white shadow-[0_20px_40px_-15px_rgba(88,101,242,0.5)] transition-all duration-300 hover:scale-105 hover:bg-[#4752C4] active:scale-95"
							>
								<div className="absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-[100%]" />
								<LogIn className="h-6 w-6" />
								디스코드로 시작하기
							</button>
						</form>

						<div className="flex flex-col items-center gap-4">
							<Link 
								href="/" 
								className="group flex items-center gap-2 text-base font-semibold text-muted-foreground/60 transition-all hover:text-primary"
							>
								<ChevronLeft className="h-5 w-5 transition-transform group-hover:-translate-x-1" />
								홈으로 가기
							</Link>
						</div>
					</div>
				</div>
			</div>
		</main>
	);
}
