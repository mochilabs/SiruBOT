import { NextResponse } from "next/server";
import { customCommandPayloadSchema } from "@sirubot/utils/customCommand";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { dataApiFailResponse, forwardDataApiPost } from "@/lib/data-api/client";
import { HEAVY_WRITE_RATE } from "@/lib/rate-limit";
import { parseSettingBody } from "@/lib/schemas";

const draftBodySchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, "어떤 명령어인지 입력해 주세요.")
    .max(500, "500자 이내로 입력해 주세요."),
});

/**
 * 커스텀 명령어 AI 초안 — 자연어 설명을 data-api의 LLM으로 JSON 스펙 초안으로 바꿔요.
 * LLM 호출이라 무거운 쓰기(5/min)로 제한하고 타임아웃을 60초로 넓혀요.
 */
export const POST = createGuildApiHandler({
  role: "manage",
  rate: HEAVY_WRITE_RATE,
  key: "custom-commands-draft",
  handler: async ({ request }) => {
    try {
      const body = await parseSettingBody(request, draftBodySchema, ["prompt"]);
      if (!body.ok) return body.response;

      const result = await forwardDataApiPost<unknown>(
        "/v1/ai/custom-command-draft",
        { prompt: body.data.prompt },
        { timeoutMs: 60_000 },
      );
      if (!result.ok) {
        return dataApiFailResponse(
          result,
          "AI 초안 생성에 실패했어요. 잠시 후 다시 시도해 주세요.",
        );
      }

      // data-api가 이미 검증했지만, 경계를 넘어온 값은 한 번 더 확인해요
      const draft = customCommandPayloadSchema.safeParse(result.data);
      if (!draft.success) {
        return NextResponse.json(
          { error: "AI 초안 형식이 올바르지 않아요. 다시 시도해 주세요." },
          { status: 502 },
        );
      }

      return NextResponse.json({ ok: true, draft: draft.data });
    } catch (error) {
      console.error("Failed to generate custom command draft:", error);
      return NextResponse.json(
        { error: "요청을 처리하지 못했어요." },
        { status: 500 },
      );
    }
  },
});
