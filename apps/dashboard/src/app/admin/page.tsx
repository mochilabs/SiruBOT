import { notFound, redirect } from "next/navigation";

import { AdminDashboard } from "@/components/admin/admin-dashboard";
import Container from "@/components/container";
import { PageHeader } from "@/components/layout/page-header";
import { isDashboardAdmin } from "@/lib/admin-ids";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
	const session = await auth();

	if (!session?.user?.id) {
		redirect("/api/auth/signin?callbackUrl=/admin");
	}

	if (!isDashboardAdmin(session.user.id)) {
		notFound();
	}

	return (
		<Container>
			<PageHeader
				title="봇 관리자 패널"
				description="시루봇 전체 시스템 현황, Lavalink 노드 제어, 길드·유저·소셜 알림 데이터를 관리해요."
			/>
			<AdminDashboard />
		</Container>
	);
}
