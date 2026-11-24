import { notFound } from "next/navigation";

import Container from "@/components/container";
import { PageHeader } from "@/components/layout/page-header";
import WebPlayerSection from "@/components/player/web-player-section";
import { STUB_GUILD_ID } from "@/lib/stub/guild-stub";

import { StubGate } from "../dashboard/stub-gate";

/**
 * 개발 전용 — 로그인·봇·data-api 없이 음악 플레이어 페이지(/player/[id])를 확인하는 페이지예요.
 * 데이터 요청은 lib/stub/guild-stub.ts가 가로채 가짜 데이터로 채워요. 프로덕션에서는 404예요.
 */
export default function PlayerPreview() {
	if (process.env.NODE_ENV === "production") notFound();

	return (
		<Container>
			<PageHeader
				title="음악 플레이어"
				description="지금 플레이 중인 곡을 실시간으로 보고, 검색해서 바로 재생해요."
			/>
			<StubGate>
				<WebPlayerSection guildId={STUB_GUILD_ID} />
			</StubGate>
		</Container>
	);
}
