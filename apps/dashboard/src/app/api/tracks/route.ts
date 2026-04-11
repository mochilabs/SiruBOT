import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const PAGE_SIZE = 50;

const fixedTrackFilter = {
    duration: {
        gt: 60 * 1000,
        lt: 60 * 1000 * 60
    },
    totalPlays: {
        gt: 10
    }
} as const;

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const currentPage = Math.max(1, page);

    const where = query ? {
        ...fixedTrackFilter,
        OR: [
            { title: { contains: query, mode: "insensitive" as const } },
            { artist: { contains: query, mode: "insensitive" as const } }
        ]
    } : fixedTrackFilter;

    try {
        const [tracks, totalCount, totalPlaybacks] = await Promise.all([
            db.track.findMany({
                orderBy: [{ totalPlays: "desc" }, { updatedAt: "desc" }],
                where,
                take: PAGE_SIZE,
                skip: (currentPage - 1) * PAGE_SIZE,
            }),
            db.track.count({
                where
            }),
            db.track.aggregate({
                _sum: {
                    totalPlays: true
                },
                where
            })
        ]);

        return NextResponse.json({
            tracks,
            totalCount,
            totalPlaybacks,
            totalPages: Math.ceil(totalCount / PAGE_SIZE),
            currentPage
        });
    } catch (error) {
        console.error("Failed to fetch tracks:", error);
        return NextResponse.json({ error: "Failed to fetch tracks" }, { status: 500 });
    }
}
