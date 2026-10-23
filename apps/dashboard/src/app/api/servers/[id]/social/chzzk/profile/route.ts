import { NextResponse } from "next/server";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { dataApiFailResponse, dataApiUserMessage, forwardDataApiPost } from "@/lib/data-api/client";
import { READ_RATE } from "@/lib/rate-limit";
import type { ChzzkProfileResponse } from "@/types/social";

const bodySchema = z.object({
  channelId: z.string().trim().min(8).max(64),
});

const FALLBACK = "치지직 채널 정보를 불러오지 못했어요.";

/** 치지직 채널 프로필 — 링크로 붙여넣은 채널 ID의 이름·프로필을 확인할 때 써요. */
export const POST = createGuildApiHandler({
  role: "manage",
  rate: READ_RATE,
  key: "social-chzzk-profile",
  schema: bodySchema,
  invalidMessage: "요청 형식이 올바르지 않아요.",
  handler: async ({ data }) => {
    const result = await forwardDataApiPost<ChzzkProfileResponse>(
      `/v1/social/chzzk/profile`,
      data,
    );
    if (!result.ok) {
      return dataApiFailResponse({ ...result, message: dataApiUserMessage(result.message, null) }, FALLBACK);
    }

    return NextResponse.json(result.data);
  },
});
