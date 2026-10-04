import { redirect } from "next/navigation";

import Container from "@/components/container";
import { PageHeader } from "@/components/layout/page-header";
import { auth } from "@/lib/auth";
import { canManage } from "@/lib/guild-permissions";

import { PlayerClient } from "./player-client";

export const metadata = {
	title: "음악 컨트롤러 | 시루봇",
	description: "서버에서 재생된 곡과 인기 트랙을 확인해요.",
};

export default async function PlayerPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const session = await auth();

	if (!session?.accessToken) {
		redirect(`/api/auth/signin?callbackUrl=/player/${id}`);
	}

	const manageable = await canManage(session.accessToken, id);

	if (!manageable) {
		return (
			<Container>
				<PageHeader title="음악 컨트롤러" description="이 서버의 재생 기록을 볼 권한이 없어요." />
				<p className="rounded-card border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning">
					서버 관리자(Manage Server) 권한이 필요해요. 권한을 받은 뒤 다시 시도해 주세요.
				</p>
			</Container>
		);
	}

	return (
		<Container>
			<PageHeader
				title="음악 컨트롤러"
				description="서버에서 재생한 곡과 많이 듣는 트랙을 모아봤어요. 실시간 재생 제어는 Discord 컨트롤러 메시지에서 할 수 있어요."
			/>
			<PlayerClient guildId={id} />
		</Container>
	);
}