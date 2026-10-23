import Link from "next/link";
import { ChevronLeft, RefreshCw } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorPageProps {
	searchParams: Promise<{ error?: string }>;
}

const ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
	AccessDenied: {
		title: "들어갈 수 없어요",
		description: "접근이 거부됐어요. 로그인한 계정이 이 기능을 쓸 수 있는지 확인해 주세요.",
	},
	Verification: {
		title: "로그인을 완료하지 못했어요",
		description: "인증 링크가 만료되거나 이미 사용됐어요. 다시 로그인해 주세요.",
	},
	default: {
		title: "로그인 중 문제가 생겼어요",
		description: "Discord 로그인이 예상대로 완료되지 않았어요. 잠시 후 다시 시도해 주세요.",
	},
};

export default async function ErrorPage({ searchParams }: ErrorPageProps) {
	const { error } = await searchParams;
	const content = ERROR_MESSAGES[error ?? "default"] ?? ERROR_MESSAGES.default;

	return (
		<main className="relative flex min-h-[calc(100svh-var(--navbar-h))] w-full items-center justify-center overflow-hidden px-4 sm:px-6 lg:px-8">
			{/* 배경 워터마크: 글자를 3:1까지 올리면 그 위를 지나가는 본문 텍스트 대비가 깨져서, 순수 장식이라 텍스트가 아닌 CSS 배경 요소로 그려요. */}
			<div className="absolute inset-0 -z-10 flex items-center justify-center" aria-hidden>
				<div className="h-[24rem] w-[44rem] max-w-[95vw] rounded-full bg-foreground/[0.06] blur-3xl" />
			</div>

			<div className="relative z-10 flex flex-col items-center text-center">
				<div className="space-y-8">
					<div className="space-y-3">
						<h1 className="text-4xl font-black tracking-tighter text-foreground break-keep sm:text-5xl md:text-6xl">
							{content.title}
						</h1>
						<p className="mx-auto max-w-md text-base font-medium leading-relaxed text-muted-foreground break-keep sm:text-lg">
							{content.description}
						</p>
						{error && (
							<p className="pt-1 font-mono text-2xs text-muted-foreground">
							코드: {error}
							</p>
						)}
					</div>

					<div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
						<Link
							href="/login"
							className={cn(buttonVariants({ variant: "cta" }), "h-11 w-full gap-2 px-6 text-base font-bold sm:w-auto")}
						>
							<RefreshCw className="h-4 w-4" aria-hidden />
							다시 로그인하기
						</Link>
						<Link
							href="/"
							className={cn(buttonVariants({ variant: "secondary" }), "h-11 w-full gap-2 px-6 text-base sm:w-auto")}
						>
							<ChevronLeft className="h-4 w-4" aria-hidden />
							홈으로 가기
						</Link>
					</div>
				</div>
			</div>
		</main>
	);
}