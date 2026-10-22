import { NextResponse } from "next/server";
import { customCommandSpecSchemaV2 } from "@sirubot/utils/customCommand";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { forwardDataApiPost } from "@/lib/data-api/client";
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

/**
 * 커스텀 명령어 AI 반복 수정 — 현재 스펙 + 수정 지시(+최근 대화 기억)를 data-api LLM에 보내
 * 지시된 부분만 바꾼 전체 스펙을 받아와요. LLM 호출이라 무거운 쓰기(5/min)로 제한하고
 * 타임아웃을 60초로 넓혀요. 반환 스펙은 빌더에만 적용돼요 — 저장은 별도 버튼이에요.
 */
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
        return NextResponse.json(
          {
            error:
              result.message ??
              "AI 수정에 실패했어요. 잠시 후 다시 시도해 주세요.",
          },
          { status: result.status },
        );
      }

      // data-api가 이미 검증했지만, 경계를 넘어온 값은 한 번 더 확인해요
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
