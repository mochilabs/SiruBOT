import { NextResponse } from "next/server";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { dataApiFailResponse, dataApiUserMessage, forwardDataApiPost } from "@/lib/data-api/client";
import { READ_RATE } from "@/lib/rate-limit";
import type { TwitchResolveResponse } from "@/types/social";

const bodySchema = z.object({
  login: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_]{4,25}$/, "트위치 로그인 아이디 형식이 아니에요."),
});

const FALLBACK = "트위치 사용자를 확인하지 못했어요.";

/** 트위치 로그인 아이디 해석 — 스트리머의 사용자 ID와 표시 이름을 찾아요. */
export const POST = createGuildApiHandler({
  role: "manage",
  rate: READ_RATE,
  key: "social-twitch-resolve",
  schema: bodySchema,
  invalidMessage: "요청 형식이 올바르지 않아요.",
  handler: async ({ data }) => {
    const result = await forwardDataApiPost<TwitchResolveResponse>(
      `/v1/social/twitch/resolve`,
      data,
    );
    if (!result.ok) {
      return dataApiFailResponse(result, dataApiUserMessage(result.message, FALLBACK));
    }

    return NextResponse.json(result.data);
  },
});
