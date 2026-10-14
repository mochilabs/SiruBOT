import { NextResponse } from "next/server";

import { authorizeDashboardAdmin, deniedUser } from "@/lib/api-guards";
import { fetchShards } from "@/lib/shard-api";

export async function GET() {
  const authz = await authorizeDashboardAdmin();
  if (!authz.ok) return deniedUser(authz);

  try {
    const data = await fetchShards();
    if (!data)
      return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to fetch shards:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
