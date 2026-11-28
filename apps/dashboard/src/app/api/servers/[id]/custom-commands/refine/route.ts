import { NextResponse } from "next/server";
import { customCommandSpecSchemaV2 } from "@sirubot/utils/customCommand";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { dataApiFailResponse, forwardDataApiPost } from "@/lib/data-api/client";
import { HEAVY_WRITE_RATE } from "@/lib/rate-limit";
import { parseSettingBody } from "@/lib/schemas";

const refineBodySchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, "수정 지시를 입력해 주세요.")
    .max(500, "500자 이내로 입력해 주세요."),
  currentSpec: customCommandSpecSchemaV2,
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(1000),
      }),
    )
    .max(16, "대화 기억은 16개까지 보낼 수 있어요.")
    .default([]),
});

export const POST = createGuildApiHandler({
  role: "manage",
  rate: HEAVY_WRITE_RATE,
  key: "custom-commands-refine",
  handler: async ({ request }) => {
    try {
      const body = await parseSettingBody(request, refineBodySchema, [
        "prompt",
        "currentSpec",
        "history",
      ]);
      if (!body.ok) return body.response;

      const result = await forwardDataApiPost<unknown>(
        "/v1/ai/custom-command-refine",
        body.data,
        { timeoutMs: 60_000 },
      );
      if (!result.ok) {
        return dataApiFailResponse(
          result,
          "AI 수정에 실패했어요. 잠시 후 다시 시도해 주세요.",
        );
      }

      const payload = result.data as { spec?: unknown } | null;
      const spec = customCommandSpecSchemaV2.safeParse(payload?.spec);
      if (!spec.success) {
        return NextResponse.json(
          { error: "AI 수정 결과 형식이 올바르지 않아요. 다시 시도해 주세요." },
          { status: 502 },
        );
      }

      return NextResponse.json({ ok: true, spec: spec.data });
    } catch (error) {
      console.error("Failed to refine custom command:", error);
      return NextResponse.json(
        { error: "요청을 처리하지 못했어요." },
        { status: 500 },
      );
    }
  },
});
