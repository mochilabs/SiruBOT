import { NextResponse } from "next/server";
import { playerWebPlayUriSchema } from "@sirubot/utils/playerWeb";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { MAX_TRACKS_PER_PLAYLIST } from "@/lib/playlist-constants";
import { ensureUserAndFavorites } from "@/lib/playlist-favorites";
import { WRITE_RATE } from "@/lib/rate-limit";

const favoriteSchema = z.object({ uri: playerWebPlayUriSchema });

/**
 * 지금 재생 중인 곡을 내 즐겨찾기에 담아요 (POST /api/servers/:id/player/favorite).
 * 라이브 상태에는 곡 주소만 있어서 봇이 재생 기록으로 저장해 둔 Track을 주소로 찾아요.
 * 즐겨찾기 담기 자체는 `/api/favorites`와 같은 규칙(없으면 생성, 중복은 409)이에요.
 */
export const POST = createGuildApiHandler({
  role: "member",
  rate: WRITE_RATE,
  key: "player-favorite",
  schema: favoriteSchema,
  invalidMessage: "추가할 곡 정보가 올바르지 않아요.",
  handler: async ({ authz, data }) => {
    try {
      const track = await db.track.findFirst({ where: { url: data.uri } });
      if (!track) {
        return NextResponse.json(
          { error: "아직 곡 정보가 저장되지 않았어요. 잠시 후 다시 시도해 주세요." },
          { status: 404 },
        );
      }

      const playlist = await ensureUserAndFavorites(authz.userId);

      const existing = await db.playlistTrack.findFirst({
        where: { playlistId: playlist.id, trackId: track.id },
      });
      if (existing) {
        return NextResponse.json(
          { error: "이미 즐겨찾기에 추가된 곡이에요.", alreadyAdded: true },
          { status: 409 },
        );
      }

      const count = await db.playlistTrack.count({ where: { playlistId: playlist.id } });
      if (count >= MAX_TRACKS_PER_PLAYLIST) {
        return NextResponse.json(
          { error: `즐겨찾기에는 곡을 최대 ${MAX_TRACKS_PER_PLAYLIST.toLocaleString()}개까지 담을 수 있어요.` },
          { status: 400 },
        );
      }

      const max = await db.playlistTrack.aggregate({
        where: { playlistId: playlist.id },
        _max: { position: true },
      });
      await db.playlistTrack.create({
        data: {
          playlistId: playlist.id,
          trackId: track.id,
          position: (max._max.position ?? -1) + 1,
        },
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error("Failed to add player favorite:", error);
      return NextResponse.json(
        { error: "즐겨찾기 추가에 실패했어요." },
        { status: 500 },
      );
    }
  },
});
