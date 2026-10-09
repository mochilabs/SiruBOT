import { NextResponse } from "next/server";

import { authorizeGuildManage, deniedGuildManage } from "@/lib/api-guards";
import { guardRateLimit, rateKey, READ_RATE } from "@/lib/rate-limit";
import type { DiscordRoleSummary } from "@/types/discord";

/** 사용자 토큰으로 역할 목록을 받아요 — @everyone과 연동(관리) 역할은 제외해요. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authz = await authorizeGuildManage(id);
  if (!authz.ok) return deniedGuildManage(authz);

  const limited = guardRateLimit(
    rateKey("roles-get", authz.userId, id),
    READ_RATE,
  );
  if (limited) return limited;

  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${id}/roles`, {
      headers: { Authorization: `Bearer ${authz.token}` },
      cache: "no-store",
    });

    if (res.status === 401) {
      return NextResponse.json(
        { error: "세션이 만료됐어요. 다시 로그인해 주세요." },
        { status: 401 },
      );
    }
    if (res.status === 403) {
      return NextResponse.json(
        { error: "Discord에서 역할 목록 접근을 거부했어요." },
        { status: 502 },
      );
    }
    if (!res.ok) {
      console.error(`Discord roles fetch failed: ${res.status}`);
      return NextResponse.json(
        { error: "Discord에서 역할 목록을 불러오지 못했어요." },
        { status: 502 },
      );
    }

    const raw: unknown = await res.json();
    if (!Array.isArray(raw)) {
      return NextResponse.json(
        { error: "Discord 응답을 처리하지 못했어요." },
        { status: 502 },
      );
    }

    const roles: DiscordRoleSummary[] = raw
      .filter(
        (role): role is Record<string, unknown> =>
          typeof role === "object" && role !== null,
      )
      .filter(
        (role) =>
          typeof role.id === "string" &&
          role.id !== id &&
          role.managed !== true,
      )
      .map((role) => {
        const color =
          typeof role.color === "number" && role.color > 0 ? role.color : null;
        return {
          id: role.id as string,
          name: typeof role.name === "string" ? role.name : "이름 없는 역할",
          color:
            color !== null ? `#${color.toString(16).padStart(6, "0")}` : null,
          position: typeof role.position === "number" ? role.position : 0,
          managed: false,
        };
      })
      .sort((a, b) => b.position - a.position);

    return NextResponse.json({ roles });
  } catch (error) {
    console.error("Failed to load roles:", error);
    return NextResponse.json(
      { error: "요청을 처리하지 못했어요." },
      { status: 500 },
    );
  }
}
