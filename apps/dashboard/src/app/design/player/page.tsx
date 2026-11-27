import { notFound } from "next/navigation";

import Container from "@/components/container";
import { PageHeader } from "@/components/layout/page-header";
import WebPlayerSection from "@/components/player/web-player-section";
import { STUB_GUILD_ID } from "@/lib/stub/guild-stub";

import { StubGate } from "../dashboard/stub-gate";

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
