import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { id } = await params;
        const userId = session.user.id;

        const playlist = await db.playlist.findFirst({
            where: { id, userId }
        });

        if (!playlist) {
            return NextResponse.json({ error: "플레이리스트를 찾을 수 없습니다." }, { status: 404 });
        }

        const playlistTracks = await db.playlistTrack.findMany({
            where: { playlistId: id },
            include: { track: true },
            orderBy: { position: "asc" }
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
            addedAt: entry.addedAt
        }));

        return NextResponse.json({ playlist, tracks });
    } catch (error) {
        console.error("Failed to fetch playlist details:", error);
        return NextResponse.json({ error: "플레이리스트 정보를 불러오지 못했습니다." }, { status: 500 });
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { id } = await params;
        const userId = session.user.id;

        const playlist = await db.playlist.findFirst({
            where: { id, userId }
        });

        if (!playlist) {
            return NextResponse.json({ error: "플레이리스트를 찾을 수 없습니다." }, { status: 404 });
        }

        if (playlist.name === "즐겨찾기") {
            return NextResponse.json({ error: "기본 제공되는 '즐겨찾기' 플레이리스트는 수정할 수 없습니다." }, { status: 400 });
        }

        const body = await request.json();
        const name = body.name?.trim();
        const description = body.description?.trim() || null;

        if (!name) {
            return NextResponse.json({ error: "플레이리스트 이름을 입력해주세요." }, { status: 400 });
        }

        if (name.length > 50) {
            return NextResponse.json({ error: "이름은 최대 50자까지 입력 가능합니다." }, { status: 400 });
        }

        if (name === "즐겨찾기") {
            return NextResponse.json({ error: '"즐겨찾기"라는 이름의 플레이리스트는 사용할 수 없습니다.' }, { status: 400 });
        }

        // Check duplicates if name is changing
        if (name !== playlist.name) {
            const existing = await db.playlist.findFirst({
                where: { userId, name }
            });
            if (existing) {
                return NextResponse.json({ error: "이미 동일한 이름의 플레이리스트가 존재합니다." }, { status: 400 });
            }
        }

        const updated = await db.playlist.update({
            where: { id },
            data: { name, description }
        });

        return NextResponse.json({ playlist: updated });
    } catch (error) {
        console.error("Failed to update playlist:", error);
        return NextResponse.json({ error: "플레이리스트 수정에 실패했습니다." }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { id } = await params;
        const userId = session.user.id;

        const playlist = await db.playlist.findFirst({
            where: { id, userId }
        });

        if (!playlist) {
            return NextResponse.json({ error: "플레이리스트를 찾을 수 없습니다." }, { status: 404 });
        }

        if (playlist.name === "즐겨찾기") {
            return NextResponse.json({ error: "기본 제공되는 '즐겨찾기' 플레이리스트는 삭제할 수 없습니다." }, { status: 400 });
        }

        await db.playlist.delete({
            where: { id }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Failed to delete playlist:", error);
        return NextResponse.json({ error: "플레이리스트 삭제에 실패했습니다." }, { status: 500 });
    }
}
