import Link from "next/link";
import { ChevronLeft,LogIn } from "lucide-react";

import Container from "@/components/container";
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
		<Container>
			<InteractiveGlow />

			<div className="relative z-10 w-full max-w-md">
				<section className="glass-panel flex flex-col overflow-hidden p-8 shadow-2xl md:p-12">
					<div className="text-center">
						<h1 className="text-title-gradient text-3xl font-extrabold tracking-tight md:text-4xl">
							대시보드 로그인
						</h1>
						<div className="mt-4 min-h-[2.5rem]">
							<TypingText 
								texts={[
									"디스코드 계정으로 간편하게 로그인하세요.",
									"시루봇의 모든 기능을 제어해보세요."
								]}
								className="text-sm font-medium leading-relaxed text-muted-foreground"
								speed={60}
							/>
						</div>
					</div>

					<div className="mt-8">
						<form
							action={async () => {
								"use server";
								await signIn("discord", { redirectTo: redirectTarget });
							}}
						>
							<button
								type="submit"
								className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-2xl bg-[#5865F2] px-6 py-4 text-base font-bold text-white shadow-lg transition-all duration-300 hover:bg-[#4752C4] hover:shadow-[#5865F2]/25 active:scale-95"
							>
								<div className="absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-[100%]" />
								<LogIn className="h-5 w-5 transition-transform group-hover:translate-x-1" />
								디스코드로 로그인
							</button>
						</form>

						<div className="mt-8 flex flex-col items-center gap-4">
							<div className="h-px w-full bg-gradient-to-r from-transparent via-border to-transparent" />
							<Link 
								href="/" 
								className="group flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
							>
								<ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
								대시보드 홈으로 돌아가기
							</Link>
						</div>
					</div>
				</section>
			</div>
		</Container>
	);
}



