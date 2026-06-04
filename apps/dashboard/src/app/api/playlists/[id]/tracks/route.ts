import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(
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

        // Verify playlist belongs to user
        const playlist = await db.playlist.findFirst({
            where: { id, userId }
        });

        if (!playlist) {
            return NextResponse.json({ error: "플레이리스트를 찾을 수 없습니다." }, { status: 404 });
        }

        const body = await request.json();
        const { trackId, youtubeUrl } = body;

        let finalTrackId = trackId;

        if (!finalTrackId && youtubeUrl) {
            // Parse Youtube Video ID
            const match = youtubeUrl.trim().match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/);
            const videoId = match ? match[1] : null;

            if (!videoId) {
                return NextResponse.json({ error: "올바르지 않은 유튜브 주소입니다." }, { status: 400 });
            }

            // Fetch metadata from noembed
            let title = "Unknown Title";
            let artist = "Unknown Artist";
            let thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

            try {
                const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`);
                if (res.ok) {
                    const json = await res.json();
                    if (json && !json.error) {
                        title = json.title || title;
                        artist = json.author_name || artist;
                        thumbnail = json.thumbnail_url || thumbnail;
                    }
                }
            } catch (err) {
                console.warn("Failed to fetch noembed metadata, using defaults:", err);
            }

            // Clean up titles (e.g. remove "Official Music Video", etc.)
            title = title.replace(/\s*[\(\[][Oo]fficial\s*([Mm]usic\s*)?[Vv]ideo[\)\]]\s*/g, "");

            // Upsert Track record
            const track = await db.track.upsert({
                where: { id: videoId },
                create: {
                    id: videoId,
                    title,
                    artist,
                    duration: 0,
                    url: `https://www.youtube.com/watch?v=${videoId}`,
                    source: "youtube",
                    thumbnail
                },
                update: {
                    title,
                    artist,
                    thumbnail
                }
            });

            finalTrackId = track.id;
        }

        if (!finalTrackId) {
            return NextResponse.json({ error: "추가할 곡의 정보가 올바르지 않습니다." }, { status: 400 });
        }

        // Check if track is already in this playlist (especially for "즐겨찾기" playlist)
        if (playlist.name === "즐겨찾기") {
            const existing = await db.playlistTrack.findFirst({
                where: { playlistId: id, trackId: finalTrackId }
            });
            if (existing) {
                return NextResponse.json({ error: "이미 즐겨찾기에 추가된 곡입니다." }, { status: 400 });
            }
        }

        // Get current max position
        const maxPositionResult = await db.playlistTrack.aggregate({
            where: { playlistId: id },
            _max: { position: true }
        });

        const nextPosition = (maxPositionResult._max.position ?? -1) + 1;

        // Create PlaylistTrack record
        const playlistTrack = await db.playlistTrack.create({
            data: {
                playlistId: id,
                trackId: finalTrackId,
                position: nextPosition
            },
            include: { track: true }
        });

        return NextResponse.json({ playlistTrack });
    } catch (error) {
        console.error("Failed to add track:", error);
        return NextResponse.json({ error: "곡을 플레이리스트에 추가하지 못했습니다." }, { status: 500 });
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
        const { searchParams } = new URL(request.url);
        const positionStr = searchParams.get("position");

        if (positionStr === null) {
            return NextResponse.json({ error: "삭제할 곡의 순서가 지정되지 않았습니다." }, { status: 400 });
        }

        const position = parseInt(positionStr, 10);

        // Verify playlist belongs to user
        const playlist = await db.playlist.findFirst({
            where: { id, userId }
        });

        if (!playlist) {
            return NextResponse.json({ error: "플레이리스트를 찾을 수 없습니다." }, { status: 404 });
        }

        // Find the specific PlaylistTrack by position
        const playlistTrack = await db.playlistTrack.findFirst({
            where: { playlistId: id, position }
        });

        if (!playlistTrack) {
            return NextResponse.json({ error: "해당 순서의 곡을 찾을 수 없습니다." }, { status: 404 });
        }

        // Run in transaction to delete and shift subsequent track positions down
        await db.$transaction([
            db.playlistTrack.delete({
                where: { id: playlistTrack.id }
            }),
            db.playlistTrack.updateMany({
                where: {
                    playlistId: id,
                    position: { gt: position }
                },
                data: {
                    position: { decrement: 1 }
                }
            })
        ]);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Failed to delete track from playlist:", error);
        return NextResponse.json({ error: "곡 삭제에 실패했습니다." }, { status: 500 });
    }
}
