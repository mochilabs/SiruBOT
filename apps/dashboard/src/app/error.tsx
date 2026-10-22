"use client";

import Container from "@/components/container";
import { ErrorPanel } from "@/components/error-panel";

export default function GlobalError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	return (
		<Container>
			<div className="pt-20">
				<ErrorPanel
					title="페이지를 불러오지 못했어요"
					message={error.message || "네트워크 상태를 확인하고 다시 시도해 주세요."}
					onRetry={reset}
				/>
			</div>
		</Container>
	);
}
