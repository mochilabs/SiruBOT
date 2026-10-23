import { NextResponse } from "next/server";

import { createGuildApiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { hasManageablePermissions } from "@/lib/guild-permissions";
import { READ_RATE } from "@/lib/rate-limit";
import { getSessionAccessToken } from "@/lib/session-token";
import type { DiscordGuild } from "@/types/discord";

export const GET = createGuildApiHandler({
  role: "user",
  rate: READ_RATE,
  key: "servers-get",
  handler: async () => {
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
          signal: AbortSignal.timeout(8_000),
        },
      );

      if (guildsRes.status === 401) {
        return NextResponse.json(
          { error: "세션이 만료됐어요. 다시 로그인해 주세요." },
          { status: 401 },
        );
      }
      if (!guildsRes.ok) {
        // 429/5xx — 일시 장애. 401이 아니라 502로 구분해 재시도 가능으로 안내해요.
        return NextResponse.json(
          { error: "Discord 서버를 잠시 확인하지 못했어요." },
          { status: 502 },
        );
      }

      const guilds: DiscordGuild[] = await guildsRes.json();
      const allGuildIds = guilds.map((g) => g.id);

      const installedGuilds = await db.guild.findMany({
        where: { id: { in: allGuildIds } },
        select: { id: true },
      });
      const installedSet = new Set(installedGuilds.map((g) => g.id));

      const enriched = guilds
        .map((guild) => {
          const isManageable = hasManageablePermissions(guild.permissions);
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
        { error: "서버 목록을 불러오지 못했어요." },
        { status: 500 },
      );
    }
  },
});
