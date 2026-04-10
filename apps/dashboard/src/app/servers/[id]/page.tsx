import { auth } from "@/lib/auth";
import { DiscordGuild } from "@/types/discord";
import { redirect } from "next/navigation";

async function getGuild(accessToken: string, guildId: string): Promise<DiscordGuild[]> {
	const res = await fetch(`https://discord.com/api/v10/users/@me/guilds/${guildId}/member`, {
		headers: { Authorization: `Bearer ${accessToken}` },
		method: "GET"
	});

	// if (!res.ok) {
	// 	throw new Error("Failed to fetch guilds");
	// }

	return res.json();
}

export default async function ServerDashboardPage({ params }: { params: { id: string } }) {
	const session = await auth();
	
	if (!session) {
		redirect("/api/auth/signin?callbackUrl=/servers");
	}

	const guild = await getGuild(session.accessToken!, params.id);
	
	return (
		<div>
			{session.accessToken}
			{params.id}
			{JSON.stringify(guild)}
		</div>
	);
}