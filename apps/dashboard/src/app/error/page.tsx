import Link from "next/link";
import { ChevronLeft, RefreshCw } from "lucide-react";

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
		<main className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-4 sm:px-6 lg:px-8">
			{/* 거대 배경 텍스트 */}
			<div className="absolute inset-0 -z-10 flex items-center justify-center">
				<span className="select-none whitespace-nowrap text-[10rem] font-black tracking-tighter text-destructive/5 sm:text-[16rem] md:text-[22rem]">
					ERROR
				</span>
			</div>

			<div className="relative z-10 flex flex-col items-center text-center">
				<div className="space-y-8">
					<div className="space-y-3">
						<h1 className="text-4xl font-black tracking-tighter text-foreground break-keep sm:text-5xl md:text-6xl">
							{content.title}
						</h1>
						<p className="mx-auto max-w-md text-base font-medium leading-relaxed text-muted-foreground/80 break-keep sm:text-lg">
							{content.description}
						</p>
						{error && (
							<p className="pt-1 font-mono text-2xs text-muted-foreground/40">
								code: {error}
							</p>
						)}
					</div>

					<div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
						<Link
							href="/login"
							className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-control bg-primary px-6 text-base font-bold text-primary-foreground transition-colors duration-fast hover:bg-primary/90 sm:w-auto"
						>
							<RefreshCw className="h-4 w-4" aria-hidden />
							다시 로그인하기
						</Link>
						<Link
							href="/"
							className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-control border border-border-strong bg-surface-2 px-6 text-base font-medium text-foreground transition-colors duration-fast hover:bg-surface-3 sm:w-auto"
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