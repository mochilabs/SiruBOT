"use client";

import { useRouter } from "next/navigation";

import { ErrorPanel } from "@/components/error-panel";

export function GuildUnavailablePanel() {
	const router = useRouter();

	return (
		<ErrorPanel
				title="서버 정보를 확인하지 못했어요"
				message="Discord 상태가 좋지 않아 멤버십을 확인하지 못했어요. 잠시 후 다시 시도해 주세요."
				onRetry={() => router.refresh()}
			/>
	);
}