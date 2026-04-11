import { notFound, redirect } from "next/navigation";

import Container from "@/components/container";
import { auth } from "@/lib/auth";

interface GuildMember {
	nick: string | null;
	roles: string[];
	joined_at: string;
	user?: {
		id: string;
		username: string;
		avatar: string | null;
	};
}

async function getGuildMember(accessToken: string, guildId: string): Promise<GuildMember | null> {
	const res = await fetch(`https://discord.com/api/v10/users/@me/guilds/${guildId}/member`, {
		headers: { Authorization: `Bearer ${accessToken}` },
		cache: "no-store",
	});

	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`Discord API error: ${res.status}`);

	return res.json();
}

export default async function ServerDashboardPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const session = await auth();

	if (!session?.accessToken) {
		redirect(`/api/auth/signin?callbackUrl=/servers/${id}`);
	}

	const member = await getGuildMember(session.accessToken, id);

	if (!member) {
		notFound();
	}

	return (
		<Container>
			<header className="mb-10 space-y-6 pb-8 border-b border-border/40">
				<div className="space-y-2">
					<h1 className="text-5xl md:text-6xl font-black tracking-tighter text-title-gradient leading-[0.9] py-1">
						서버 대시보드
					</h1>
					<p className="text-xl font-medium text-muted-foreground/80 leading-relaxed max-w-2xl">
						이 페이지는 아직 개발 중이에요.
					</p>
				</div>
			</header>
		</Container>
	);
}