import { NextResponse } from "next/server";

import { searchQuerySchema } from "@/app/api/_shared/validation";
import { createGuildApiHandler } from "@/lib/api-handler";
import { requestPlayerSearch } from "@/lib/data-api/player-web";
import { WRITE_RATE } from "@/lib/rate-limit";

export const POST = createGuildApiHandler({
  role: "member",
  rate: WRITE_RATE,
  key: "player-search",
  schema: searchQuerySchema,
  invalidMessage: "검색어는 1~200자까지 입력할 수 있어요.",
  handler: async ({ guildId, authz, data }) => {
    const result = await requestPlayerSearch(guildId, authz.userId, data.query);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? "검색을 처리하지 못했어요.", ...(result.code ? { code: result.code } : {}) },
        { status: result.status },
      );
    }

    return NextResponse.json({ tracks: result.tracks ?? [] });
  },
});
