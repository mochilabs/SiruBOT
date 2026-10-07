import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  MAX_PLAYLIST_DESCRIPTION_LENGTH,
  MAX_PLAYLISTS_PER_USER,
} from "@/lib/playlist-constants";
import { guardRateLimit, rateKey, WRITE_RATE } from "@/lib/rate-limit";

const createPlaylistSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "플레이리스트 이름을 입력해주세요.")
    .max(50, "이름은 최대 50자까지 입력 가능합니다."),
  description: z
    .string()
    .trim()
    .max(
      MAX_PLAYLIST_DESCRIPTION_LENGTH,
      `설명은 최대 ${MAX_PLAYLIST_DESCRIPTION_LENGTH}자까지 입력 가능합니다.`,
    )
    .nullish()
    .transform((value) => (value ? value : null)),
});

async function ensureUserAndFavorites(userId: string) {
  // 1. Ensure User record exists
  await db.user.upsert({
    where: { id: userId },
    create: { id: userId },
    update: {},
  });

  // 2. Ensure default "즐겨찾기" playlist exists
  const favorites = await db.playlist.findFirst({
    where: { userId, name: "즐겨찾기" },
  });

  if (!favorites) {
    await db.playlist.create({
      data: {
        userId,
        name: "즐겨찾기",
        description: "즐겨찾기한 음악 목록입니다.",
      },
    });
  }
}

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userId = session.user.id;
    await ensureUserAndFavorites(userId);

    const playlists = await db.playlist.findMany({
      where: { userId },
      include: {
        _count: {
          select: { tracks: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ playlists });
  } catch (error) {
    console.error("Failed to fetch playlists:", error);
    return NextResponse.json(
      { error: "Failed to fetch playlists" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = guardRateLimit(
    rateKey("playlists-post", session.user.id),
    WRITE_RATE,
  );
  if (limited) return limited;

  try {
    const userId = session.user.id;
    await ensureUserAndFavorites(userId);

    const parsed = createPlaylistSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json(
        { error: issue?.message ?? "잘못된 요청입니다." },
        { status: 400 },
      );
    }

    const name = parsed.data.name;
    const description = parsed.data.description;

    if (name === "즐겨찾기") {
      return NextResponse.json(
        {
          error:
            '"즐겨찾기"라는 이름의 플레이리스트는 추가로 생성할 수 없습니다.',
        },
        { status: 400 },
      );
    }

    // 플레이리스트 개수 상한 (userId별)
    const playlistCount = await db.playlist.count({ where: { userId } });
    if (playlistCount >= MAX_PLAYLISTS_PER_USER) {
      return NextResponse.json(
        {
          error: `플레이리스트는 최대 ${MAX_PLAYLISTS_PER_USER}개까지 만들 수 있어요.`,
        },
        { status: 400 },
      );
    }

    // Check duplicates
    const existing = await db.playlist.findFirst({
      where: { userId, name },
    });

    if (existing) {
      return NextResponse.json(
        { error: "이미 동일한 이름의 플레이리스트가 존재합니다." },
        { status: 400 },
      );
    }

    const playlist = await db.playlist.create({
      data: {
        userId,
        name,
        description,
      },
    });

    return NextResponse.json({ playlist });
  } catch (error) {
    console.error("Failed to create playlist:", error);
    return NextResponse.json(
      { error: "플레이리스트 생성에 실패했습니다." },
      { status: 500 },
    );
  }
}
