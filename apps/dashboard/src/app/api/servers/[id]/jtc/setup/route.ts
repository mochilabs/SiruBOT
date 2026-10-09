import { NextResponse } from "next/server";

import { authorizeGuildManage, deniedGuildManage } from "@/lib/api-guards";
import { notifyGuildSettingsChanged } from "@/lib/data-api";
import { db } from "@/lib/db";
import { guardRateLimit, HEAVY_WRITE_RATE, rateKey } from "@/lib/rate-limit";
import { jtcSetupSchema, zodError } from "@/lib/schemas";

/** 봇 tempVoiceService.MARKER_CHANNEL_NAME과 일치해야 해요 */
const MARKER_CHANNEL_NAME = "🔊 임시방 만들기";
const GUILD_VOICE = 2;
const GUILD_STAGE_VOICE = 13;
const GUILD_CATEGORY = 4;

interface DiscordChannelObject {
  id: string;
  type: number;
  parent_id?: string | null;
}

function discordError(status: number): NextResponse | null {
  if (status === 401)
    return NextResponse.json(
      { error: "세션이 만료됐어요. 다시 로그인해 주세요." },
      { status: 401 },
    );
  if (status === 403) {
    return NextResponse.json(
      {
        error:
          "채널을 만들 권한이 없어요. 내 계정에 '채널 관리' 권한이 있는지 확인해 주세요.",
      },
      { status: 502 },
    );
  }
  if (status === 404)
    return NextResponse.json(
      { error: "채널을 찾을 수 없어요." },
      { status: 404 },
    );
  return null;
}

async function discordJson(
  token: string,
  url: string,
  init?: RequestInit,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  const body: unknown = await res.json().catch(() => null);
  return { status: res.status, body };
}

function isChannelObject(body: unknown): body is DiscordChannelObject {
  return (
    typeof body === "object" &&
    body !== null &&
    typeof (body as DiscordChannelObject).id === "string" &&
    typeof (body as DiscordChannelObject).type === "number"
  );
}

/**
 * 임시 음성(JTC) 마커 채널 준비 — 봇 setupMarkerChannel과 같은 동작을
 * 사용자 토큰으로 수행해요: 카테고리 검증 → 마커 재사용(이동) 또는 생성 → DB 저장.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authz = await authorizeGuildManage(id);
  if (!authz.ok) return deniedGuildManage(authz);

  const limited = guardRateLimit(
    rateKey("jtc-setup", authz.userId, id),
    HEAVY_WRITE_RATE,
  );
  if (limited) return limited;
  const token = authz.token;

  try {
    const body: unknown = await request.json().catch(() => null);
    const parsed = jtcSetupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: zodError(parsed.error) },
        { status: 400 },
      );
    }
    const { categoryId } = parsed.data;

    // 1) 선택한 채널이 카테고리인지 확인
    const category = await discordJson(
      token,
      `https://discord.com/api/v10/channels/${categoryId}`,
    );
    const categoryError = discordError(category.status);
    if (categoryError) return categoryError;
    if (
      !isChannelObject(category.body) ||
      category.body.type !== GUILD_CATEGORY
    ) {
      return NextResponse.json(
        { error: "카테고리 채널만 선택할 수 있어요." },
        { status: 400 },
      );
    }

    // 2) 기존 마커 재사용(카테고리 이동) 또는 새 마커 생성
    const guild = await db.guild.findUnique({ where: { id } });
    let markerId = guild?.jtcMarkerChannelId ?? null;
    let markerBody: unknown = null;

    if (markerId) {
      const existing = await discordJson(
        token,
        `https://discord.com/api/v10/channels/${markerId}`,
      );
      if (
        existing.status === 200 &&
        isChannelObject(existing.body) &&
        (existing.body.type === GUILD_VOICE ||
          existing.body.type === GUILD_STAGE_VOICE)
      ) {
        markerBody = existing.body;
      } else {
        markerId = null;
      }
    }

    if (
      markerId &&
      markerBody &&
      isChannelObject(markerBody) &&
      markerBody.parent_id !== categoryId
    ) {
      const moved = await discordJson(
        token,
        `https://discord.com/api/v10/channels/${markerId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ parent_id: categoryId }),
        },
      );
      const moveError = discordError(moved.status);
      if (moveError) return moveError;
    }

    if (!markerId) {
      const created = await discordJson(
        token,
        `https://discord.com/api/v10/guilds/${id}/channels`,
        {
          method: "POST",
          body: JSON.stringify({
            name: MARKER_CHANNEL_NAME,
            type: GUILD_VOICE,
            parent_id: categoryId,
          }),
        },
      );
      const createError = discordError(created.status);
      if (createError) return createError;
      if (!isChannelObject(created.body)) {
        return NextResponse.json(
          { error: "Discord 응답을 처리하지 못했어요." },
          { status: 502 },
        );
      }
      markerId = created.body.id;
    }

    // 3) DB 저장
    await db.guild.upsert({
      where: { id },
      create: { id, jtcCategoryId: categoryId, jtcMarkerChannelId: markerId },
      update: { jtcCategoryId: categoryId, jtcMarkerChannelId: markerId },
    });

    // 저장 성공 후 모든 봇 프로세스의 설정 캐시를 무효화해요 (fire-and-forget).
    // 실패해도 봇은 60초 TTL 폴백으로 결국 최신 설정을 읽으므로 응답을 막지 않아요.
    notifyGuildSettingsChanged(id).catch((error) => {
      console.warn(`Failed to notify JTC setup change (guild ${id}):`, error);
    });

    return NextResponse.json({ categoryId, markerChannelId: markerId });
  } catch (error) {
    console.error("Failed to set up JTC marker channel:", error);
    return NextResponse.json(
      { error: "요청을 처리하지 못했어요." },
      { status: 500 },
    );
  }
}
