import { NextResponse } from "next/server";

import { fetchDataApiStatus } from "@/lib/data-api";

export async function GET() {
    try {
        const data = await fetchDataApiStatus();
        if (!data) return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
        return NextResponse.json(data);
    } catch (error) {
        console.error("Failed to fetch data-api status:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
