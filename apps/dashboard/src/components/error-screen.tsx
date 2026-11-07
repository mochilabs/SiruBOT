"use client";

import Link from "next/link";
import { Home, RefreshCw } from "lucide-react";

import { ErrorRoom } from "@/components/error-room";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

interface ErrorScreenProps {
	title: string;
	message: string;
	onRetry: () => void;
}

/** 라우트 단위 오류 화면 — 404와 같은 좌측 타이포 + 우측 일러스트 2단 구성이에요 */
export function ErrorScreen({ title, message, onRetry }: ErrorScreenProps) {
	return (
		<main className="mx-auto grid min-h-[calc(100svh-var(--navbar-h))] w-full max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
			<div className="flex flex-col items-start gap-8">
				<div className="space-y-3">
					<h1 className="break-keep text-4xl font-black tracking-tighter text-foreground sm:text-5xl">{title}</h1>
					<p className="max-w-md break-keep text-base font-medium leading-relaxed text-muted-foreground sm:text-lg">{message}</p>
				</div>

				<div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
					<button type="button" onClick={onRetry} className={cn(buttonVariants({ variant: "cta" }), "h-11 gap-2.5 px-8 text-base font-bold")}>
						<RefreshCw className="h-5 w-5" aria-hidden />
						다시 시도하기
					</button>
					<Link
						href="/"
						className="group flex h-11 items-center gap-1.5 rounded-control px-4 text-sm font-medium text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<Home className="h-4 w-4" aria-hidden />
						홈으로 가기
					</Link>
				</div>
			</div>

			<ErrorRoom className="mx-auto block h-auto w-full max-w-sm lg:max-w-none" />
		</main>
	);
}
