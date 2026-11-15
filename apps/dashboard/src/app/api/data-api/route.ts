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
    const data = await fetchDataApi<DataApiStatus>("/v1/status");
    if (!data)
      return NextResponse.json({ error: "데이터 API 상태를 불러오지 못했어요." }, { status: 500 });
    return NextResponse.json(data);
  },
});
