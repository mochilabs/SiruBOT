import { NextResponse } from "next/server";

import { createGuildApiHandler } from "@/lib/api-handler";
import { fetchDataApi } from "@/lib/data-api/client";
import type { DataApiStatus } from "@/lib/data-api/types";
import { READ_RATE } from "@/lib/rate-limit";

export const GET = createGuildApiHandler({
  role: "admin",
  rate: READ_RATE,
  key: "data-api-get",
  handler: async () => {
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
  },
});
