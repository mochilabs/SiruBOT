import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

async function ensureUserAndFavorites(userId: string) {
    // 1. Ensure User record exists
    await db.user.upsert({
        where: { id: userId },
        create: { id: userId },
        update: {}
    });

    // 2. Ensure default "즐겨찾기" playlist exists
    const favorites = await db.playlist.findFirst({
        where: { userId, name: "즐겨찾기" }
    });

    if (!favorites) {
        await db.playlist.create({
            data: {
                userId,
                name: "즐겨찾기",
                description: "즐겨찾기한 음악 목록입니다."
            }
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
                    select: { tracks: true }
                }
            },
            orderBy: { createdAt: "desc" }
        });

        return NextResponse.json({ playlists });
    } catch (error) {
        console.error("Failed to fetch playlists:", error);
        return NextResponse.json({ error: "Failed to fetch playlists" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const userId = session.user.id;
        await ensureUserAndFavorites(userId);

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
            return NextResponse.json({ error: '"즐겨찾기"라는 이름의 플레이리스트는 추가로 생성할 수 없습니다.' }, { status: 400 });
        }

        // Check duplicates
        const existing = await db.playlist.findFirst({
            where: { userId, name }
        });

        if (existing) {
            return NextResponse.json({ error: "이미 동일한 이름의 플레이리스트가 존재합니다." }, { status: 400 });
        }

        const playlist = await db.playlist.create({
            data: {
                userId,
                name,
                description
            }
        });

        return NextResponse.json({ playlist });
    } catch (error) {
        console.error("Failed to create playlist:", error);
        return NextResponse.json({ error: "플레이리스트 생성에 실패했습니다." }, { status: 500 });
    }
}
