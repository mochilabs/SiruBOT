"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
	const router = useRouter();
	const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
	const [countdown, setCountdown] = useState(Math.floor(intervalMs / 1000));

	useEffect(() => {
		const refreshTimer = setInterval(() => {
			router.refresh();
			setLastRefresh(new Date());
			setCountdown(Math.floor(intervalMs / 1000));
		}, intervalMs);

		const countdownTimer = setInterval(() => {
			setCountdown((prev) => Math.max(0, prev - 1));
		}, 1000);

		return () => {
			clearInterval(refreshTimer);
			clearInterval(countdownTimer);
		};
	}, [router, intervalMs]);

	return (
		<div className="rounded-2xl border border-secondary/20 bg-secondary/5 px-3 py-2 text-xs text-muted-foreground font-semibold backdrop-blur-sm">
			<div className="flex items-center gap-2">
				<span className="animate-pulse-soft h-1.5 w-1.5 rounded-full bg-secondary" />
				<span>{countdown}초 뒤에 새로고침</span>
				<span className="h-3 w-[1px] bg-muted-foreground/20 mx-1" />
				<span className="text-muted-foreground/60">마지막 업데이트: {lastRefresh.toLocaleTimeString("ko-KR")}</span>
			</div>
		</div>
	);
}

