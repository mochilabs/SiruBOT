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
		<FocusPageShell>
			<div className="relative z-10 flex flex-col items-center text-center">
				<div className="space-y-8">
					<div className="flex flex-col items-center space-y-4">
						<div className="relative flex h-32 w-32 items-center justify-center rounded-full bg-surface-1 p-6">
							<UserPlus className="h-12 w-12 text-primary-text" />
						</div>

						<div className="space-y-2">
							<h1 className="text-5xl font-black tracking-tighter text-foreground md:text-7xl">
								시루봇과 함께해요
							</h1>
							<div className="inline-flex items-center gap-2 rounded-control bg-surface-1 px-3 py-1 text-xs font-bold text-muted-foreground min-w-[200px] justify-center tabular-nums">
								<Loader size="xs" iconOnly />
								<span>{count}초 뒤에 자동으로 이동할게요...</span>
							</div>
						</div>
					</div>

					<div className="max-w-md mx-auto mb-0">
						<p className="text-lg font-medium leading-relaxed text-muted-foreground md:text-xl break-keep">
							시루를 초대하면 음악 신청과 대기열 관리, 웹 플레이어로 서버의 재생을 이어갈 수 있어요.
						</p>
					</div>

					<div className="flex flex-col items-center gap-6 pt-8">
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
						className="group flex items-center gap-2 rounded-control px-2 text-base font-semibold text-muted-foreground transition-colors duration-fast hover:text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 pointer-coarse:min-h-11"
					>
						<Home className="h-5 w-5" />
						홈으로 가기
					</Link>

					</div>
				</div>
			</div>
		</FocusPageShell>
	);
}
