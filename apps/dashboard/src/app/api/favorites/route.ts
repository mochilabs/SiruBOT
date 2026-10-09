import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { guardRateLimit, rateKey, WRITE_RATE } from "@/lib/rate-limit";

const favoriteSchema = z.object({
  trackId: z.string().trim().min(1).max(64),
});

const FAVORITES_PLAYLIST_NAME = "즐겨찾기";

/**
 * 트랙 → 즐겨찾기 원클릭 추가 (POST /api/favorites)
 * 즐겨찾기 플레이리스트(없으면 자동 생성)에 곡을 추가해요. 이미 추가된 곡이면 409.
 */
export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  const limited = guardRateLimit(
    rateKey("favorites-post", session.user.id),
    WRITE_RATE,
  );
  if (limited) return limited;

  const parsed = favoriteSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "추가할 곡 정보가 올바르지 않아요." },
      { status: 400 },
    );
  }

  const { trackId } = parsed.data;
  const userId = session.user.id;

  try {
    const track = await db.track.findUnique({ where: { id: trackId } });
    if (!track) {
      return NextResponse.json(
        { error: "곡을 찾을 수 없어요." },
        { status: 404 },
      );
    }

    const favorites = await db.playlist.findFirst({
      where: { userId, name: FAVORITES_PLAYLIST_NAME },
    });

    const playlist =
      favorites ??
      (await db.$transaction(async (tx) => {
        await tx.user.upsert({
          where: { id: userId },
          create: { id: userId },
          update: {},
        });
        return tx.playlist.create({
          data: {
            userId,
            name: FAVORITES_PLAYLIST_NAME,
            description: "즐겨찾기한 음악 목록입니다.",
          },
        });
      }));

    const existing = await db.playlistTrack.findFirst({
      where: { playlistId: playlist.id, trackId },
    });
    if (existing) {
      return NextResponse.json(
        { error: "이미 즐겨찾기에 추가된 곡이에요.", alreadyAdded: true },
        { status: 409 },
      );
    }

    const maxPosition = await db.playlistTrack.aggregate({
      where: { playlistId: playlist.id },
      _max: { position: true },
    });

    const playlistTrack = await db.playlistTrack.create({
      data: {
        playlistId: playlist.id,
        trackId,
        position: (maxPosition._max.position ?? -1) + 1,
      },
    });

    return NextResponse.json({
      success: true,
      playlistId: playlist.id,
      position: playlistTrack.position,
    });
  } catch (error) {
    console.error("Failed to add favorite:", error);
    return NextResponse.json(
      { error: "즐겨찾기 추가에 실패했어요." },
      { status: 500 },
    );
  }
}

/**
 * 즐겨찾기 제거 (DELETE /api/favorites?trackId=...)
 * 차트 하트 토글 2번째 클릭(이미 즐겨찾기 상태)에서 사용해요.
 */
export async function DELETE(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  const limited = guardRateLimit(
    rateKey("favorites-delete", session.user.id),
    WRITE_RATE,
  );
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const trackId = searchParams.get("trackId");
  if (!trackId || trackId.length > 64) {
    return NextResponse.json(
      { error: "삭제할 곡 정보가 올바르지 않아요." },
      { status: 400 },
    );
  }

  const userId = session.user.id;

  try {
    const playlist = await db.playlist.findFirst({
      where: { userId, name: FAVORITES_PLAYLIST_NAME },
    });
    if (!playlist) {
      return NextResponse.json(
        { error: "즐겨찾기가 비어 있어요." },
        { status: 404 },
      );
    }

    const item = await db.playlistTrack.findFirst({
      where: { playlistId: playlist.id, trackId },
    });
    if (!item) {
      return NextResponse.json(
        { error: "즐겨찾기에 없는 곡이에요.", alreadyRemoved: true },
        { status: 404 },
      );
    }

    await db.$transaction([
      db.playlistTrack.delete({ where: { id: item.id } }),
      db.playlistTrack.updateMany({
        where: { playlistId: playlist.id, position: { gt: item.position } },
        data: { position: { decrement: 1 } },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to remove favorite:", error);
    return NextResponse.json(
      { error: "즐겨찾기 제거에 실패했어요." },
      { status: 500 },
    );
  }
}

/**
 * 즐겨찾기 표시 상태 조회 (GET /api/favorites) — 현재 페이지 트랙 ID 목록으로 필터링
 */
export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const trackIds = (searchParams.get("trackIds") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0 && id.length <= 64)
    .slice(0, 100);

  if (trackIds.length === 0) {
    return NextResponse.json({ trackIds: [] });
  }

  const userId = session.user.id;

  try {
    const playlist = await db.playlist.findFirst({
      where: { userId, name: FAVORITES_PLAYLIST_NAME },
    });
    if (!playlist) {
      return NextResponse.json({ trackIds: [] });
    }

    const items = await db.playlistTrack.findMany({
      where: { playlistId: playlist.id, trackId: { in: trackIds } },
      select: { trackId: true },
    });

    return NextResponse.json({ trackIds: items.map((i) => i.trackId) });
  } catch (error) {
    console.error("Failed to fetch favorites state:", error);
    return NextResponse.json({ trackIds: [] });
  }
}