import { NextResponse } from "next/server";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { db } from "@/lib/db";
import {
  FAVORITES_PLAYLIST_NAME,
  MAX_PLAYLIST_DESCRIPTION_LENGTH,
} from "@/lib/playlist-constants";
import { rateKey, READ_RATE, WRITE_RATE } from "@/lib/rate-limit";
import { zodError } from "@/lib/schemas";

const updatePlaylistSchema = z.object({
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
  key: "playlist-get",
  handler: async ({ authz, params }) => {
    try {
      const playlistId = params.id;
      const userId = authz.userId;

      const playlist = await db.playlist.findFirst({
        where: { id: playlistId, userId },
      });

      if (!playlist) {
        return NextResponse.json(
          { error: "플레이리스트를 찾을 수 없어요." },
          { status: 404 },
        );
      }

      const playlistTracks = await db.playlistTrack.findMany({
        where: { playlistId },
        include: { track: true },
        orderBy: { position: "asc" },
      });

      const tracks = playlistTracks.map((entry) => ({
        id: entry.track.id,
        title: entry.track.title,
        artist: entry.track.artist,
        duration: entry.track.duration,
        thumbnail: entry.track.thumbnail,
        url: entry.track.url,
        source: entry.track.source,
        playlistTrackId: entry.id,
        position: entry.position,
        addedAt: entry.addedAt,
      }));

      return NextResponse.json({ playlist, tracks });
    } catch (error) {
      console.error("Failed to fetch playlist details:", error);
      return NextResponse.json(
        { error: "플레이리스트 정보를 불러오지 못했어요." },
        { status: 500 },
      );
    }
  },
});

export const PATCH = createGuildApiHandler({
  role: "user",
  rate: WRITE_RATE,
  key: "playlist-patch",
  // 플레이리스트 id까지 버킷에 넣는 기존 키를 그대로 유지해요.
  rateKey: ({ key, userId, params }) => rateKey(key, userId, params.id),
  handler: async ({ authz, params, request }) => {
    const playlistId = params.id;
    const userId = authz.userId;

    try {
      const playlist = await db.playlist.findFirst({
        where: { id: playlistId, userId },
      });

      if (!playlist) {
        return NextResponse.json(
          { error: "플레이리스트를 찾을 수 없어요." },
          { status: 404 },
        );
      }

      if (playlist.name === FAVORITES_PLAYLIST_NAME) {
        return NextResponse.json(
          {
            error: "기본 제공되는 '즐겨찾기' 플레이리스트는 수정할 수 없어요.",
          },
          { status: 400 },
        );
      }

      // 소유 검증이 먼저라 본문 파싱은 핸들러 안에서 해요 (래퍼 schema 대신 직접 검증).
      const parsed = updatePlaylistSchema.safeParse(
        await request.json().catch(() => null),
      );
      if (!parsed.success) {
        return NextResponse.json(
          { error: zodError(parsed.error) },
          { status: 400 },
        );
      }

      const name = parsed.data.name;
      const description = parsed.data.description;

      if (name === FAVORITES_PLAYLIST_NAME) {
        return NextResponse.json(
          { error: '"즐겨찾기"라는 이름의 플레이리스트는 사용할 수 없어요.' },
          { status: 400 },
        );
      }

      // Check duplicates if name is changing
      if (name !== playlist.name) {
        const existing = await db.playlist.findFirst({
          where: { userId, name },
        });
        if (existing) {
          return NextResponse.json(
            { error: "이미 같은 이름의 플레이리스트가 있어요." },
            { status: 400 },
          );
        }
      }

      const updated = await db.playlist.update({
        where: { id: playlistId },
        data: { name, description },
      });

      return NextResponse.json({ playlist: updated });
    } catch (error) {
      console.error("Failed to update playlist:", error);
      return NextResponse.json(
        { error: "플레이리스트 수정에 실패했어요." },
        { status: 500 },
      );
    }
  },
});

export const DELETE = createGuildApiHandler({
  role: "user",
  rate: WRITE_RATE,
  key: "playlist-delete",
  rateKey: ({ key, userId, params }) => rateKey(key, userId, params.id),
  handler: async ({ authz, params }) => {
    const playlistId = params.id;
    const userId = authz.userId;

    try {
      const playlist = await db.playlist.findFirst({
        where: { id: playlistId, userId },
      });

      if (!playlist) {
        return NextResponse.json(
          { error: "플레이리스트를 찾을 수 없어요." },
          { status: 404 },
        );
      }

      if (playlist.name === FAVORITES_PLAYLIST_NAME) {
        return NextResponse.json(
          {
            error: "기본 제공되는 '즐겨찾기' 플레이리스트는 삭제할 수 없어요.",
          },
          { status: 400 },
        );
      }

      await db.playlist.delete({
        where: { id: playlistId },
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error("Failed to delete playlist:", error);
      return NextResponse.json(
        { error: "플레이리스트 삭제에 실패했어요." },
        { status: 500 },
      );
    }
  },
});
