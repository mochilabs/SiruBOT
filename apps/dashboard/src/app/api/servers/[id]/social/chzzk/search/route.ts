import { NextResponse } from "next/server";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { dataApiFailResponse, dataApiUserMessage, forwardDataApiGet } from "@/lib/data-api/client";
import { READ_RATE } from "@/lib/rate-limit";
import type { ChzzkSearchResponse } from "@/types/social";

const querySchema = z.object({
  keyword: z.string().trim().min(1).max(50),
  offset: z.coerce.number().int().min(0).default(0),
  size: z.coerce.number().int().min(1).max(20).default(10),
});

const FALLBACK = "치지직 채널 검색에 실패했어요.";

/** 치지직 채널 검색 — 관리자가 구독할 채널을 찾는 용도예요. notifier가 치지직 공개 검색 API를 대신 호출해요. */
export const GET = createGuildApiHandler({
  role: "manage",
  rate: READ_RATE,
  key: "social-chzzk-search",
  handler: async ({ request }) => {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      keyword: url.searchParams.get("keyword") ?? "",
      offset: url.searchParams.get("offset") ?? undefined,
      size: url.searchParams.get("size") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "요청 형식이 올바르지 않아요." }, { status: 400 });
    }

    const query = new URLSearchParams({
      keyword: parsed.data.keyword,
      offset: String(parsed.data.offset),
      size: String(parsed.data.size),
    });
    const result = await forwardDataApiGet<ChzzkSearchResponse>(
      `/v1/social/chzzk/search?${query.toString()}`,
    );
    if (!result.ok) {
      return dataApiFailResponse({ ...result, message: dataApiUserMessage(result.message, null) }, FALLBACK);
    }

    return NextResponse.json(result.data);
  },
});
