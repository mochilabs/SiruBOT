import { NextResponse } from "next/server";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { FAVORITES_PLAYLIST_NAME } from "@/lib/playlist-constants";
import { ensureUserAndFavorites } from "@/lib/playlist-favorites";
import { READ_RATE, WRITE_RATE } from "@/lib/rate-limit";

const favoriteSchema = z.object({
  trackId: z.string().trim().min(1).max(64),
});

/**
 * 트랙 → 즐겨찾기 원클릭 추가 (POST /api/favorites)
 * 즐겨찾기 플레이리스트(없으면 자동 생성)에 곡을 추가해요. 이미 추가된 곡이면 409.
 */
export const POST = createGuildApiHandler({
  role: "user",
  rate: WRITE_RATE,
  key: "favorites-post",
  schema: favoriteSchema,
  invalidMessage: "추가할 곡 정보가 올바르지 않아요.",
  handler: async ({ data, authz }) => {
    const { trackId } = data;
    const userId = authz.userId;

    try {
      const track = await db.track.findUnique({ where: { id: trackId } });
      if (!track) {
        return NextResponse.json(
          { error: "곡을 찾을 수 없어요." },
          { status: 404 },
        );
      }

      // 없으면 자동 생성(유저 upsert + 즐겨찾기 생성) — playlists 라우트와 같은 보장이에요.
      const playlist = await ensureUserAndFavorites(userId);

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
  },
});

/**
 * 즐겨찾기 제거 (DELETE /api/favorites?trackId=...)
 * 차트 하트 토글 2번째 클릭(이미 즐겨찾기 상태)에서 사용해요.
 */
export const DELETE = createGuildApiHandler({
  role: "user",
  rate: WRITE_RATE,
  key: "favorites-delete",
  handler: async ({ request, authz }) => {
    const { searchParams } = new URL(request.url);
    const trackId = searchParams.get("trackId");
    if (!trackId || trackId.length > 64) {
      return NextResponse.json(
        { error: "삭제할 곡 정보가 올바르지 않아요." },
        { status: 400 },
      );
    }

    const userId = authz.userId;

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
  },
});

/**
 * 즐겨찾기 표시 상태 조회 (GET /api/favorites) — 현재 페이지 트랙 ID 목록으로 필터링
 */
export const GET = createGuildApiHandler({
  role: "user",
  rate: READ_RATE,
  key: "favorites-get",
  handler: async ({ request, authz }) => {
    const { searchParams } = new URL(request.url);
    const trackIds = (searchParams.get("trackIds") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0 && id.length <= 64)
      .slice(0, 100);

    if (trackIds.length === 0) {
      return NextResponse.json({ trackIds: [] });
    }

    const userId = authz.userId;

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
  },
});
