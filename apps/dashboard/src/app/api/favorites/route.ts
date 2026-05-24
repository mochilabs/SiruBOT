import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const userFavorites = await db.userFavorite.findMany({
            where: { userId: session.user.id },
            include: { track: true },
            orderBy: { track: { totalPlays: "desc" } },
        });

        const tracks = userFavorites.map((entry) => entry.track);

        return NextResponse.json({ tracks });
    } catch (error) {
        console.error("Failed to fetch favorites:", error);
        return NextResponse.json({ error: "Failed to fetch favorites" }, { status: 500 });
    }
}
