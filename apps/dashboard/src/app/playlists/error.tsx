"use client";

import Container from "@/components/container";
import { ErrorPanel } from "@/components/error-panel";

export default function PlaylistsError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	return (
		<Container>
			<ErrorPanel
				title="플레이리스트를 불러오지 못했어요"
				message={error.message || "네트워크 상태를 확인하고 다시 시도해주세요."}
				onRetry={reset}
			/>
		</Container>
	);
}
