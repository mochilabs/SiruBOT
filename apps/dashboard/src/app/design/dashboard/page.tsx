import { notFound } from "next/navigation";

import Container from "@/components/container";
import { PageHeader } from "@/components/layout/page-header";
import { ServerDashboard } from "@/components/servers/server-dashboard";
import { STUB_GUILD_ID } from "@/lib/stub/guild-stub";

import { StubGate } from "./stub-gate";

/**
 * 개발 전용 — 로그인·봇·data-api 없이 서버 대시보드를 확인하는 페이지예요.
 * 탭의 데이터 요청은 lib/stub/guild-stub.ts가 가로채 가짜 데이터로 채워요(쓰기는 저장되지 않아요). 프로덕션에서는 404예요.
 * ?tab= 으로 탭을 바꿀 수 있어요.
 */
export default function DashboardLayoutPreview() {
	if (process.env.NODE_ENV === "production") notFound();

	return (
		<Container>
			<PageHeader className="mb-2 pb-0 sm:mb-4 sm:pb-2" title="데모 서버" />
			<StubGate>
				<ServerDashboard guildId={STUB_GUILD_ID} manageable guildName="데모 서버" />
			</StubGate>
		</Container>
	);
}
