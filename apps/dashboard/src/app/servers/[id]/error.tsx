"use client";

import { ErrorScreen } from "@/components/error-screen";

export default function ServerDashboardError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	return (
		<ErrorScreen
			title="서버 대시보드를 불러오지 못했어요"
			message={error.message || "네트워크 상태를 확인하고 다시 시도해 주세요."}
			onRetry={reset}
		/>
	);
}
