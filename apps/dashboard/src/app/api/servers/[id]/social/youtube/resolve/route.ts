import { NextResponse } from "next/server";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { dataApiUserMessage, forwardDataApiPost } from "@/lib/data-api/client";
import { READ_RATE } from "@/lib/rate-limit";
import type { YouTubeResolveResponse } from "@/types/social";

const bodySchema = z.object({
  input: z.string().trim().min(1).max(200),
});

const FALLBACK = "유튜브 채널을 확인하지 못했어요.";

/** 유튜브 채널 해석 — URL·@핸들·UC 채널 ID를 채널 ID와 이름으로 바꿔요. */
export const POST = createGuildApiHandler({
  role: "manage",
  rate: READ_RATE,
  key: "social-youtube-resolve",
  schema: bodySchema,
  invalidMessage: "요청 형식이 올바르지 않아요.",
  handler: async ({ data }) => {
    const result = await forwardDataApiPost<YouTubeResolveResponse>(
      `/v1/social/youtube/resolve`,
      data,
    );
    if (!result.ok) {
      return NextResponse.json(
        { error: dataApiUserMessage(result.message, FALLBACK) },
        { status: result.message ? result.status : 502 },
      );
    }

    return NextResponse.json(result.data);
  },
});
