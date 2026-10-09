"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Home, UserPlus } from "lucide-react";

import Loader from "@/components/loader";
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
		<main className="relative flex h-[100svh] w-full items-center justify-center overflow-hidden px-4 sm:px-6 lg:px-8">

			<div className="relative z-10 flex flex-col items-center text-center">
				{/* Immersive Background Text - Optimized for Mobile */}
				<div className="absolute inset-0 -z-10 flex items-center justify-center">
					<span className="text-[10rem] sm:text-[18rem] md:text-[28rem] font-black text-primary/5 select-none tracking-tighter uppercase whitespace-nowrap">
						초대하기
					</span>
				</div>

				<div className="space-y-8">
					<div className="flex flex-col items-center space-y-4">
						<div className="relative flex h-32 w-32 items-center justify-center rounded-full border border-border bg-surface-1 p-6">
							<UserPlus className="h-12 w-12 text-primary-text" />
						</div>

						<div className="space-y-2">
							<h1 className="text-title-gradient text-5xl font-extrabold tracking-tighter md:text-7xl">
								시루봇과 함께해요
							</h1>
							<div className="inline-flex items-center gap-2 rounded-menu border border-border-subtle bg-surface-1 px-3 py-1 text-xs font-bold text-muted-foreground w-[200px] justify-center tabular-nums">
								<Loader size="xs" iconOnly />
								<span>{count}초 뒤에 자동으로 이동할게요...</span>
							</div>
						</div>
					</div>

					<div className="max-w-md mx-auto mb-0">
						<p className="text-lg font-medium leading-relaxed text-muted-foreground md:text-xl break-keep">
							최고의 음악 경험을 전하는 시루를 초대해보세요.
						</p>
					</div>

					<div className="flex flex-col items-center gap-6 pt-8">
						<a
							href={inviteUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex h-11 items-center gap-3 rounded-control bg-primary px-8 text-base font-bold text-primary-foreground transition-colors duration-fast hover:bg-primary/90"
						>
							<UserPlus className="h-5 w-5" />
							지금 초대하기
							<ExternalLink className="h-4 w-4 opacity-60 transition-opacity" />
						</a>

						<Link
							href="/"
							className="group flex items-center gap-2 text-base font-semibold text-muted-foreground transition-colors duration-fast hover:text-primary-text"
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
