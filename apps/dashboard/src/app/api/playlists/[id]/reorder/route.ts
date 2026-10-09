import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { guardRateLimit, rateKey, WRITE_RATE } from "@/lib/rate-limit";

const reorderSchema = z.object({
  sourceIndex: z
    .number()
    .int("순서는 정수여야 해요.")
    .min(0, "순서는 0 이상이어야 해요."),
  destinationIndex: z
    .number()
    .int("순서는 정수여야 해요.")
    .min(0, "순서는 0 이상이어야 해요."),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = guardRateLimit(
    rateKey("playlist-reorder", session.user.id),
    WRITE_RATE,
  );
  if (limited) return limited;

  try {
    const { id: playlistId } = await params;
    const userId = session.user.id;

    // Verify playlist belongs to user
    const playlist = await db.playlist.findFirst({
      where: { id: playlistId, userId },
    });

    if (!playlist) {
      return NextResponse.json(
        { error: "플레이리스트를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const parsed = reorderSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: "이동 경로 정보가 유효하지 않습니다." },
        { status: 400 },
      );
    }

    const { sourceIndex, destinationIndex } = parsed.data;

    if (sourceIndex === destinationIndex) {
      return NextResponse.json({ success: true });
    }

    // Fetch target track to move
    const targetTrack = await db.playlistTrack.findUnique({
      where: {
        playlistId_position: {
          playlistId,
          position: sourceIndex,
        },
      },
    });

    if (!targetTrack) {
      return NextResponse.json(
        { error: "해당 위치의 곡을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    // destinationIndex에 상한이 없으면 목록 끝을 넘긴 position으로 빈틈이 생겨요
    const trackCount = await db.playlistTrack.count({ where: { playlistId } });
    if (destinationIndex >= trackCount) {
      return NextResponse.json(
        { error: "이동 경로 정보가 유효하지 않습니다." },
        { status: 400 },
      );
    }

    // Run reordering inside a transaction
    await db.$transaction(async (tx) => {
      // 1. Temporarily move the target track to a position outside the unique bounds (-1)
      await tx.playlistTrack.update({
        where: { id: targetTrack.id },
        data: { position: -1 },
      });

      // 2. Shift other tracks
      if (sourceIndex < destinationIndex) {
        // Shift tracks in between down by 1 (e.g. moving a track from index 2 to index 5)
        await tx.playlistTrack.updateMany({
          where: {
            playlistId,
            position: { gt: sourceIndex, lte: destinationIndex },
          },
          data: { position: { decrement: 1 } },
        });
      } else {
        // Shift tracks in between up by 1 (e.g. moving a track from index 5 to index 2)
        await tx.playlistTrack.updateMany({
          where: {
            playlistId,
            position: { gte: destinationIndex, lt: sourceIndex },
          },
          data: { position: { increment: 1 } },
        });
      }

      // 3. Move target track to destinationIndex
      await tx.playlistTrack.update({
        where: { id: targetTrack.id },
        data: { position: destinationIndex },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to reorder tracks:", error);
    return NextResponse.json(
      { error: "순서 변경에 실패했습니다." },
      { status: 500 },
    );
  }
}
