import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { Button } from "@/components/primitives/button";
import { signIn } from "@/lib/auth";

interface LoginPageProps {
	searchParams: Promise<{ callbackUrl?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
	const { callbackUrl } = await searchParams;
	const redirectTarget = callbackUrl || "/servers";

	return (
		<main className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-4 sm:px-6 lg:px-8">
			{/* 거대 배경 텍스트 */}
			<div className="absolute inset-0 -z-10 flex items-center justify-center">
				<span className="select-none whitespace-nowrap text-[10rem] font-black tracking-tighter text-primary/5 sm:text-[18rem] md:text-[26rem]">
					시루봇
				</span>
			</div>

			<div className="relative z-10 flex flex-col items-center text-center">
				<div className="space-y-10">
					<div className="flex flex-col items-center space-y-6">
						<div className="flex h-24 w-24 items-center justify-center rounded-full border border-border bg-surface-1 p-5 sm:h-32 sm:w-32 sm:p-6">
							{/* Discord 로고 — 브랜드 색 */}
							<svg viewBox="0 0 24 24" fill="currentColor" className="h-10 w-10 text-discord-primary sm:h-12 sm:w-12" aria-hidden>
								<path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.03ZM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z" />
							</svg>
						</div>

						<div className="space-y-3">
							<h1 className="text-4xl font-black tracking-tighter text-foreground break-keep sm:text-5xl md:text-6xl">
								로그인하고 서버를 관리해요
							</h1>
							<p className="mx-auto max-w-md text-base font-medium leading-relaxed text-muted-foreground/80 break-keep sm:text-lg">
								Discord 계정으로 로그인하면 플레이리스트·서버 설정·음악 컨트롤러를 그대로 이어서 쓸 수 있어요.
							</p>
						</div>
					</div>

					<div className="flex flex-col items-center gap-6 pt-2">
						<form
							action={async () => {
								"use server";
								await signIn("discord", { redirectTo: redirectTarget });
							}}
							className="w-full"
						>
							<Button
								type="submit"
								variant="cta"
								className="mx-auto h-11 w-full max-w-sm gap-2.5 bg-discord-primary px-8 text-base font-bold text-primary-foreground hover:bg-discord-primary/90"
							>
								디스코드로 계속하기
							</Button>
						</form>

						<Link
							href="/"
							className="group flex items-center gap-1.5 text-sm font-medium text-muted-foreground/60 transition-colors duration-fast hover:text-foreground"
						>
							<ChevronLeft className="h-4 w-4 transition-transform duration-fast group-hover:-translate-x-0.5" aria-hidden />
							홈으로 돌아가기
						</Link>
					</div>
				</div>
			</div>
		</main>
	);
}