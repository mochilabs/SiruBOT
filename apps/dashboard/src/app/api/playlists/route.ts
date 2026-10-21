import { NextResponse } from "next/server";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import {
  FAVORITES_PLAYLIST_NAME,
  MAX_PLAYLIST_DESCRIPTION_LENGTH,
  MAX_PLAYLISTS_PER_USER,
} from "@/lib/playlist-constants";
import { ensureUserAndFavorites } from "@/lib/playlist-favorites";
import { READ_RATE, WRITE_RATE } from "@/lib/rate-limit";

const createPlaylistSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "플레이리스트 이름을 입력해 주세요.")
    .max(50, "이름은 최대 50자까지 입력할 수 있어요."),
  description: z
    .string()
    .trim()
    .max(
      MAX_PLAYLIST_DESCRIPTION_LENGTH,
      `설명은 최대 ${MAX_PLAYLIST_DESCRIPTION_LENGTH}자까지 입력할 수 있어요.`,
    )
    .nullish()
    .transform((value) => (value ? value : null)),
});

export const GET = createGuildApiHandler({
  role: "user",
  rate: READ_RATE,
  key: "playlists-get",
  handler: async ({ authz }) => {
    try {
      const userId = authz.userId;
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
        { error: "플레이리스트를 불러오지 못했어요." },
        { status: 500 },
      );
    }
  },
});

export const POST = createGuildApiHandler({
  role: "user",
  rate: WRITE_RATE,
  key: "playlists-post",
  schema: createPlaylistSchema,
  handler: async ({ authz, data }) => {
    try {
      const userId = authz.userId;
      await ensureUserAndFavorites(userId);

      const name = data.name;
      const description = data.description;

      if (name === FAVORITES_PLAYLIST_NAME) {
        return NextResponse.json(
          {
            error:
              '"즐겨찾기"라는 이름의 플레이리스트는 추가로 생성할 수 없어요.',
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
          { error: "이미 같은 이름의 플레이리스트가 있어요." },
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
        { error: "플레이리스트 생성에 실패했어요." },
        { status: 500 },
      );
    }
  },
});
