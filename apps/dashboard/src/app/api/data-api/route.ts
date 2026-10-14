import { NextResponse } from "next/server";

import { authorizeDashboardAdmin, deniedUser } from "@/lib/api-guards";
import type { DataApiStatus } from "@/lib/data-api";
import { fetchDataApi } from "@/lib/data-api";

export async function GET() {
  const authz = await authorizeDashboardAdmin();
  if (!authz.ok) return deniedUser(authz);

  try {
    const data = await fetchDataApi<DataApiStatus>("/v1/status");
    if (!data)
      return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to fetch data-api status:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
