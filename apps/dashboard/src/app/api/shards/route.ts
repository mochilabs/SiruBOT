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
        return NextResponse.json({ error: "샤드 정보를 불러오지 못했어요." }, { status: 500 });
      return NextResponse.json(data);
    } catch (error) {
      console.error("Failed to fetch shards:", error);
      return NextResponse.json(
        { error: "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요." },
        { status: 500 },
      );
    }
  },
});
