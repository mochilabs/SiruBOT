import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PAGE_SIZE, fixedTrackFilter } from "@/lib/track-constants";
import { z } from "zod";

const tracksQuerySchema = z.object({
  query: z.string().max(200).default(""),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    
    const parsed = tracksQuerySchema.safeParse({
        query: searchParams.get("query") || "",
        page: searchParams.get("page") || "1",
    });

    if (!parsed.success) {
        return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    const { query, page: currentPage } = parsed.data;

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
