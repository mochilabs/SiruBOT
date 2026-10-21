import { NextResponse } from "next/server";

import { createGuildApiHandler } from "@/lib/api-handler";
import { READ_RATE } from "@/lib/rate-limit";
import { fetchShards } from "@/lib/shard-api";

export const GET = createGuildApiHandler({
  role: "admin",
  rate: READ_RATE,
  key: "shards-get",
  handler: async () => {
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
  },
});
