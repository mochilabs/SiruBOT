"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
		<div className="rounded-2xl border border-[rgba(252,214,229,0.18)] bg-[rgba(252,214,229,0.1)] px-3 py-2 text-xs text-[rgba(245,245,247,0.72)]">
			<div className="flex items-center gap-2">
				<span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[color:var(--secondary)]" />
				<span className="font-medium">자동 갱신 {countdown}초</span>
				<span className="h-3 w-[1px] bg-[rgba(245,245,247,0.18)] mx-1" />
				<span className="opacity-60">마지막 {lastRefresh.toLocaleTimeString("ko-KR")}</span>
			</div>
		</div>
	);
}

