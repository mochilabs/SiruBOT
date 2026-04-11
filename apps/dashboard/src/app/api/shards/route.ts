import { NextResponse } from "next/server";
import { fetchShards } from "@/lib/shard-api";

export async function GET() {
    const data = await fetchShards();
    if (!data) return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
    return NextResponse.json(data);
}