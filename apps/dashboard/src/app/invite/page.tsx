"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Home, UserPlus } from "lucide-react";

import { FocusPageShell } from "@/app/_components/focus-page-shell";
import Loader from "@/components/loader";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buildInviteUrl } from "@/utils";

export default function InvitePage() {
	const appUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
	const inviteUrl = buildInviteUrl({ redirect_url: `${appUrl}/invite/redirect` });
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
		<FocusPageShell>
			<div className="space-y-4">
				<h1 className="break-keep text-5xl font-black tracking-tighter text-foreground md:text-6xl">시루봇과 함께해요</h1>
				<p className="max-w-md break-keep text-base font-medium leading-relaxed text-muted-foreground sm:text-lg">
					시루를 초대하면 음악 신청과 대기열 관리, 웹 플레이어로 서버의 재생을 이어갈 수 있어요.
				</p>
				<div className="inline-flex min-w-[200px] items-center justify-center gap-2 rounded-control bg-surface-1 px-3 py-1 text-xs font-bold tabular-nums text-muted-foreground">
					<Loader size="xs" iconOnly />
					<span>{count}초 뒤에 자동으로 이동할게요...</span>
				</div>
			</div>

			<div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
				<a
					href={inviteUrl}
					target="_blank"
					rel="noopener noreferrer"
					className={cn(buttonVariants({ variant: "cta" }), "h-11 gap-3 px-8 text-base font-bold")}
				>
					<UserPlus className="h-5 w-5" />
					지금 초대하기
					<ExternalLink className="h-4 w-4 opacity-60 transition-opacity" />
				</a>
				<Link
					href="/"
					className="group flex items-center gap-2 rounded-control px-2 text-base font-semibold text-muted-foreground transition-colors duration-fast hover:text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<Home className="h-5 w-5" />
					홈으로 가기
				</Link>
			</div>
		</FocusPageShell>
	);
}
