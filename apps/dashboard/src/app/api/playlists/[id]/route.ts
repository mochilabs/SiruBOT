import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { MAX_PLAYLIST_DESCRIPTION_LENGTH } from "@/lib/playlist-constants";
import { guardRateLimit, rateKey, WRITE_RATE } from "@/lib/rate-limit";

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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const userId = session.user.id;

    const playlist = await db.playlist.findFirst({
      where: { id, userId },
    });

    if (!playlist) {
      return NextResponse.json(
        { error: "플레이리스트를 찾을 수 없어요." },
        { status: 404 },
      );
    }

    const playlistTracks = await db.playlistTrack.findMany({
      where: { playlistId: id },
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
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.id;

  const limited = guardRateLimit(
    rateKey("playlist-patch", userId, id),
    WRITE_RATE,
  );
  if (limited) return limited;

  try {
    const playlist = await db.playlist.findFirst({
      where: { id, userId },
    });

    if (!playlist) {
      return NextResponse.json(
        { error: "플레이리스트를 찾을 수 없어요." },
        { status: 404 },
      );
    }

    if (playlist.name === "즐겨찾기") {
      return NextResponse.json(
        {
          error: "기본 제공되는 '즐겨찾기' 플레이리스트는 수정할 수 없어요.",
        },
        { status: 400 },
      );
    }

    const parsed = updatePlaylistSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json(
        { error: issue?.message ?? "요청 형식이 올바르지 않아요." },
        { status: 400 },
      );
    }

    const name = parsed.data.name;
    const description = parsed.data.description;

    if (name === "즐겨찾기") {
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
      where: { id },
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
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.id;

  const limited = guardRateLimit(
    rateKey("playlist-delete", userId, id),
    WRITE_RATE,
  );
  if (limited) return limited;

  try {
    const playlist = await db.playlist.findFirst({
      where: { id, userId },
    });

    if (!playlist) {
      return NextResponse.json(
        { error: "플레이리스트를 찾을 수 없어요." },
        { status: 404 },
      );
    }

    if (playlist.name === "즐겨찾기") {
      return NextResponse.json(
        {
          error: "기본 제공되는 '즐겨찾기' 플레이리스트는 삭제할 수 없어요.",
        },
        { status: 400 },
      );
    }

    await db.playlist.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete playlist:", error);
    return NextResponse.json(
      { error: "플레이리스트 삭제에 실패했어요." },
      { status: 500 },
    );
  }
}
