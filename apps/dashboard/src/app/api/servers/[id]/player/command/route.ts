import { NextResponse } from "next/server";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { requestPlayerControl } from "@/lib/data-api/player-web";
import { WRITE_RATE } from "@/lib/rate-limit";

/**
 * 라이브 컨트롤러 — 볼륨·일시정지·재생·스킵·정지를 봇에 전달해요.
 * 요청자의 관리자/DJ 권한과 음성 채널은 봇만 판정할 수 있어서 userId까지 전달하고,
 * 봇이 검증 실패를 실은 안내 문구를 그대로 응답해요 (400/502/503).
 */
const commandSchema = z
  .object({
    action: z.enum(["volume", "pause", "resume", "skip", "stop", "repeat"]),
    value: z.number().int().min(0).max(150).optional(),
  })
  .refine(
    (body) => body.action !== "volume" || typeof body.value === "number",
    {
      message: "volume 제어에는 value(0~150)가 필요해요.",
    },
  );

export const POST = createGuildApiHandler({
  role: "member",
  rate: WRITE_RATE,
  key: "player-command",
  schema: commandSchema,
  invalidMessage: "명령 형식이 올바르지 않아요.",
  handler: async ({ guildId, authz, data }) => {
    const result = await requestPlayerControl(
      guildId,
      authz.userId,
      data.action,
      data.value,
    );
    if (!result.ok) {
      return NextResponse.json(
        {
          error:
            result.error ??
            "명령을 전달하지 못했어요. 잠시 후 다시 시도해 주세요.",
        },
        { status: result.status },
      );
    }

    return NextResponse.json({ ok: true });
  },
});
