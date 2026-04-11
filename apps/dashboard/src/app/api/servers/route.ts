import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { DiscordGuild } from "@/types/discord";

export async function GET() {
	const session = await auth();

	if (!session?.accessToken) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const guildsRes = await fetch("https://discord.com/api/v10/users/@me/guilds", {
			headers: { Authorization: `Bearer ${session.accessToken}` },
			cache: "no-store",
		});

		if (!guildsRes.ok) {
			return NextResponse.json({ error: "Failed to fetch guilds" }, { status: guildsRes.status });
		}

		const guilds: DiscordGuild[] = await guildsRes.json();
		const allGuildIds = guilds.map((g) => g.id);

		const installedGuilds = await db.guild.findMany({
			where: { id: { in: allGuildIds } },
			select: { id: true },
		});
		const installedSet = new Set(installedGuilds.map((g) => g.id));

		const MANAGE_GUILD = BigInt(0x20);
		const ADMINISTRATOR = BigInt(0x8);

		const enriched = guilds
			.map((guild) => {
				const permissions = BigInt(guild.permissions);
				const isManageable =
					(permissions & MANAGE_GUILD) === MANAGE_GUILD ||
					(permissions & ADMINISTRATOR) === ADMINISTRATOR;
				const isInstalled = installedSet.has(guild.id);

				return { ...guild, isManageable, isInstalled };
			})
			.filter((g) => g.isManageable || g.isInstalled)
			.sort((a, b) => {
				if (a.isInstalled !== b.isInstalled) return a.isInstalled ? -1 : 1;
				if (a.isManageable !== b.isManageable) return a.isManageable ? -1 : 1;
				return a.name.localeCompare(b.name);
			});

		return NextResponse.json({ guilds: enriched });
	} catch (error) {
		console.error("Failed to fetch servers:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
