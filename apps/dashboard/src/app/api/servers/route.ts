import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSessionAccessToken } from "@/lib/session-token";
import type { DiscordGuild } from "@/types/discord";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = await getSessionAccessToken();
  if (!accessToken) {
    return NextResponse.json(
      { error: "세션이 만료됐어요. 다시 로그인해 주세요." },
      { status: 401 },
    );
  }

  try {
    const guildsRes = await fetch(
      "https://discord.com/api/v10/users/@me/guilds",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      },
    );

    if (!guildsRes.ok) {
      return NextResponse.json(
        { error: "Failed to fetch guilds" },
        { status: guildsRes.status },
      );
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
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
