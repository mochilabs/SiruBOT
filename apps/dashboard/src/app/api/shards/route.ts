import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { fetchShards } from "@/lib/shard-api";

export async function GET() {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const data = await fetchShards();
        if (!data) return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
        return NextResponse.json(data);
    } catch (error) {
        console.error("Failed to fetch shards:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}