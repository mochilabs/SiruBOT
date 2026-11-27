import { NextResponse } from "next/server";

import { createGuildApiHandler } from "@/lib/api-handler";
import { dataApiFailResponse } from "@/lib/data-api/client";
import { fetchTtsVoices } from "@/lib/data-api/tts";
import { READ_RATE } from "@/lib/rate-limit";

export const GET = createGuildApiHandler({
  role: "user",
  rate: READ_RATE,
  key: "tts-voices-get",
  handler: async () => {
    const result = await fetchTtsVoices();
    if (!result.ok) return dataApiFailResponse(result, "음성 목록을 불러오지 못했어요.");
    return NextResponse.json({ items: result.data.items ?? [] });
  },
});
