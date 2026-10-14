"use client";

import { useRouter } from "next/navigation";

import { ErrorPanel } from "@/components/error-panel";

/**
 * Discord 일시 장애(429/5xx/네트워크) 안내 패널이에요.
 * 멤버십 확인이 "지금 안 되는 것"과 "멤버가 아닌 것"을 구분해요.
 * 전자는 404로 위장하지 않고 이 패널로 안내하고, 새로고침으로 다시 시도해요.
 */
export function GuildUnavailablePanel() {
	const router = useRouter();

	return (
		<div className="py-12">
			<ErrorPanel
				title="서버 정보를 확인하지 못했어요"
				message="Discord 상태가 좋지 않아 멤버십을 확인하지 못했어요. 잠시 후 다시 시도해 주세요."
				onRetry={() => router.refresh()}
			/>
		</div>
	);
}