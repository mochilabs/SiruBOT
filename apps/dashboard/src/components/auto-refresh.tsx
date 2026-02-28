'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export function AutoRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
	const router = useRouter();
	const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
	const [countdown, setCountdown] = useState(intervalMs / 1000);

	useEffect(() => {
		const refreshTimer = setInterval(() => {
			router.refresh();
			setLastRefresh(new Date());
			setCountdown(intervalMs / 1000);
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
		<div className="flex items-center gap-3 text-xs text-gray-400">
			<div className="flex items-center gap-1.5">
				<span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
				<span>자동 갱신: {countdown}초</span>
			</div>
			<span>마지막: {lastRefresh.toLocaleTimeString('ko-KR')}</span>
		</div>
	);
}
